/**
 * Pure transforms applied to a chapter's EPUB HTML before the reader shows it:
 * relative image paths point at the book's image endpoint, a chapter title
 * written over several lines becomes one line, and a FEN line printed next to
 * a diagram is hidden (the diagram shows it on demand) while its text stays in
 * the document so the recogniser still reads it.
 */

/** Separator the API uses between the lines of a chapter title (TocLabel::SEPARATOR). */
export const API_TITLE_SEPARATOR = ' — '

/** Default separator between the lines of a chapter title. */
export const DEFAULT_TITLE_SEPARATOR = ' - '

const IMAGE_EXT = /\.(?:jpe?g|png|gif|webp|svg)$/i

/** Encode a path for a URL without double-encoding what is already encoded. */
function encodePath(path: string): string {
  let decoded = path
  try {
    decoded = decodeURIComponent(path)
  } catch {
    // A stray "%" — encode the path as written.
  }
  return decoded.split('/').map(encodeURIComponent).join('/')
}

/** Point relative <img src> and SVG <image href> paths at the book's image endpoint. */
export function rewriteImageSources(html: string, bookId: number | string): string {
  if (!html) return html
  const target = (path: string) => `/api/library/books/${bookId}/images/${encodePath(path)}`
  return html
    // <img src="../Images/x.jpg">
    .replace(/src=(["'])(?!data:|[a-z][a-z0-9+.-]*:|\/|#)((?:\.\.?\/)*)([^"']+)\1/gi,
      (_m, q: string, _dots: string, path: string) => `src=${q}${target(path)}${q}`)
    // SVG <image xlink:href="../Images/x.jpg"> (links to other documents are left alone)
    .replace(/(xlink:href|href)=(["'])(?!data:|[a-z][a-z0-9+.-]*:|\/|#)((?:\.\.?\/)*)([^"']+)\2/gi,
      (m, attr: string, q: string, _dots: string, path: string) =>
        IMAGE_EXT.test(path) ? `${attr}=${q}${target(path)}${q}` : m)
}

/** Re-join the lines of an API chapter title ("Capítulo dos — Emanuel II") with `separator`. */
export function formatChapterTitle(title: string, separator: string = DEFAULT_TITLE_SEPARATOR): string {
  if (!title.includes(API_TITLE_SEPARATOR)) return title
  return title.split(API_TITLE_SEPARATOR).map((l) => l.trim()).filter(Boolean).join(separator || ' ')
}

/**
 * The chapter's title heading (its first h1/h2) written over several lines
 * ("Capítulo dos<br/>Emanuel II") becomes one line joined by `separator`.
 * Returns how many headings were joined (0 or 1).
 */
export function joinTitleLines(root: ParentNode, separator: string = DEFAULT_TITLE_SEPARATOR): number {
  if (separator === '') separator = ' '
  const heading = root.querySelector('h1, h2')
  if (!heading || !heading.querySelector('br')) return 0
  heading.querySelectorAll('br').forEach((br) => {
    const prev = br.previousSibling
    const next = br.nextSibling
    if (prev?.nodeType === Node.TEXT_NODE) prev.textContent = (prev.textContent ?? '').replace(/\s+$/, '')
    if (next?.nodeType === Node.TEXT_NODE) next.textContent = (next.textContent ?? '').replace(/^\s+/, '')
    br.replaceWith(br.ownerDocument.createTextNode(separator))
  })
  // Drop the separator a trailing/leading <br> left at either end.
  const text = (heading.textContent ?? '').trim()
  const sep = separator.trim()
  if (sep && (text.startsWith(sep) || text.endsWith(sep))) {
    const walker = heading.ownerDocument.createTreeWalker(heading, NodeFilter.SHOW_TEXT)
    const nodes: Text[] = []
    while (walker.nextNode()) nodes.push(walker.currentNode as Text)
    const first = nodes.find((n) => n.data.trim() !== '')
    const last = [...nodes].reverse().find((n) => n.data.trim() !== '')
    if (first && first.data.trim().startsWith(sep)) first.data = first.data.trimStart().slice(sep.length).trimStart()
    if (last && last.data.trim().endsWith(sep)) last.data = last.data.trimEnd().slice(0, -sep.length).trimEnd()
  }
  return 1
}

const RANK = '[1-8pnbrqkPNBRQK]{1,8}'
const FEN_LINE = new RegExp(
  `^${RANK}(?:/${RANK}){7}(?:\\s+[wb](?:\\s+(?:-|[KQkq]{1,4})(?:\\s+(?:-|[a-h][36]))?(?:\\s+\\d+\\s+\\d+)?)?)?$`,
)

/** Is `text` (one line) a FEN position? */
export function isFenLine(text: string): boolean {
  return FEN_LINE.test(text.replace(/\s+/g, ' ').trim())
}

const textOf = (el: Element) => (el.textContent ?? '').replace(/\s+/g, ' ').trim()

/** An element with neither text nor image (spacer paragraphs, rules). */
const isBlank = (el: Element) => textOf(el) === '' && !el.querySelector('img, svg, image') && !/^(?:IMG|SVG)$/i.test(el.tagName)

/** The diagram image an element is (or holds alone, with no text), or null. */
function diagramImage(el: Element | null): Element | null {
  if (!el) return null
  if (el.tagName.toUpperCase() === 'IMG') return el
  if (textOf(el) !== '') return null
  const images = el.querySelectorAll('img')
  return images.length === 1 ? images[0] : null
}

/** The nearest non-blank element sibling in one direction (skipping at most a few spacers). */
function neighbour(el: Element, dir: 'previousElementSibling' | 'nextElementSibling'): Element | null {
  let at = el[dir]
  for (let skipped = 0; at && isBlank(at) && skipped < 3; skipped++) at = at[dir]
  return at && !isBlank(at) ? at : null
}

/**
 * A FEN line printed right before or after a diagram is hidden from view (kept
 * in the document so the recogniser still starts a game from it) and its
 * position is handed to the image (`data-fen`, `data-text-fen`), so the diagram
 * can show it on demand. Returns how many FEN lines were hidden.
 */
export function hideFensNextToDiagrams(root: ParentNode): number {
  let count = 0
  root.querySelectorAll('p, div').forEach((inner) => {
    if (inner.querySelector('img, p, div')) return
    const fen = textOf(inner)
    if (!isFenLine(fen)) return
    // The outermost block holding only this FEN (`<div class="fen"><div>FEN</div></div>`).
    let el: Element = inner
    while (el.parentElement && /^(?:P|DIV)$/.test(el.parentElement.tagName.toUpperCase())
      && el.parentElement !== root && textOf(el.parentElement) === fen && !el.parentElement.querySelector('img')) {
      el = el.parentElement
    }
    if (el.classList.contains('epub-fen-hidden')) return
    const img = diagramImage(neighbour(el, 'nextElementSibling')) ?? diagramImage(neighbour(el, 'previousElementSibling'))
    if (!img) return
    el.classList.add('epub-fen-hidden')
    el.setAttribute('aria-hidden', 'true')
    if (!img.hasAttribute('data-fen')) img.setAttribute('data-fen', fen)
    img.setAttribute('data-text-fen', fen)
    count++
  })
  return count
}

export interface PrepareChapterOptions {
  /** Joins the lines of a chapter title written over several lines (default " - "). */
  titleSeparator?: string
}

/**
 * Everything the reader does to a chapter's HTML before showing it (and before
 * recognising its games, so both read the same text).
 */
export function prepareChapterHtml(
  html: string,
  bookId: number | string,
  options: PrepareChapterOptions = {},
): string {
  if (!html) return html
  const rewritten = rewriteImageSources(html, bookId)
  const doc = new DOMParser().parseFromString(rewritten, 'text/html')
  const joined = joinTitleLines(doc.body, options.titleSeparator ?? DEFAULT_TITLE_SEPARATOR)
  const hidden = hideFensNextToDiagrams(doc.body)
  if (joined === 0 && hidden === 0) return rewritten
  // Keep the book's stylesheet (in <head>) with the content.
  const styles = [...doc.head.querySelectorAll('style, link[rel="stylesheet"]')].map((s) => s.outerHTML).join('')
  return styles + doc.body.innerHTML
}
