import { normalizeQuote, type Suggestion, type SuggestionAnchor } from './suggestionFormat'

/**
 * Applying accepted suggestions to a chapter's HTML in the browser, until
 * they are written into the EPUB. A suggestion whose anchor (or target image)
 * is no longer found is skipped and reported as stale.
 */

const BLOCK_SELECTOR = 'p, h1, h2, h3, h4, h5, h6, li, pre, blockquote, table, figure'

/** The outermost block elements of a chapter, in document order: what an anchor's blockIndex counts. */
export function chapterBlocks(root: ParentNode): Element[] {
  return Array.from(root.querySelectorAll(BLOCK_SELECTOR)).filter((el) => !el.parentElement?.closest(BLOCK_SELECTOR))
}

const REMOVED = 'script, iframe, frame, frameset, object, embed, applet, base, link, meta, style, form, input, button, textarea, select, noscript, noembed, noframes, xmp, template, foreignObject, animate, set, animateTransform, animateMotion'
const URL_ATTRS = new Set(['href', 'src', 'xlink:href', 'action', 'formaction', 'poster', 'background', 'srcset', 'data'])

/** Whether a URL is safe in a chapter: relative, http(s), or (for images) a PNG, JPEG or WebP data URL. */
export function safeUrl(url: string, image = false): boolean {
  const u = url.trim()
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001f]/.test(u)) return false
  const scheme = /^([a-z][a-z0-9+.-]*):/i.exec(u)?.[1]?.toLowerCase()
  if (!scheme) return true
  if (scheme === 'http' || scheme === 'https') return true
  return image && scheme === 'data' && /^data:image\/(png|jpeg|webp);base64,/i.test(u)
}

/** HTML from a suggestion made safe to put in a chapter: no scripts, frames, event handlers or script URLs. */
export function sanitizeHtml(html: string): string {
  const body = new DOMParser().parseFromString(`<body>${html}</body>`, 'text/html').body
  body.querySelectorAll(REMOVED).forEach((el) => el.remove())
  for (const el of Array.from(body.querySelectorAll('*'))) {
    for (const attr of Array.from(el.attributes)) {
      const name = attr.name.toLowerCase()
      const unsafe = name.startsWith('on')
        || name === 'srcdoc'
        || (URL_ATTRS.has(name) && !safeUrl(attr.value, name === 'src' && el.tagName === 'IMG'))
        || (name === 'style' && /expression|javascript:|url\s*\(/i.test(attr.value))
      if (unsafe) el.removeAttribute(attr.name)
    }
  }
  return body.innerHTML
}

/** The block an anchor points at: the one at its index when its text still starts with the quote, else the only block that does. */
function findBlock(blocks: Element[], anchor: SuggestionAnchor | undefined): Element | null {
  if (!anchor) return null
  const starts = (el: Element) => {
    const text = normalizeQuote(el.textContent ?? '')
    return anchor.quote === '' ? text === '' : text.startsWith(anchor.quote)
  }
  const at = blocks[anchor.blockIndex]
  if (at && starts(at)) return at
  if (anchor.quote === '') return null
  const matches = blocks.filter(starts)
  return matches.length === 1 ? matches[0] : null
}

const pathOf = (src: string) => src.split(/[?#]/)[0]
function sameImage(src: string, target: string): boolean {
  if (src === target) return true
  const a = pathOf(src), b = pathOf(target)
  if (!a || !b) return false
  return a === b || a.endsWith(`/${b.replace(/^\.?\//, '')}`) || b.endsWith(`/${a.replace(/^\.?\//, '')}`)
}

const FEN = /^([1-8pnbrqkPNBRQK]{1,8}\/){7}[1-8pnbrqkPNBRQK]{1,8}(\s[wb](\s\S+){0,4})?$/

/** A field of `after`: the value itself when it is a string, else after[key]. */
function field(after: unknown, key: string): string | null {
  if (typeof after === 'string') return after
  if (after && typeof after === 'object' && typeof (after as Record<string, unknown>)[key] === 'string') return (after as Record<string, string>)[key]
  return null
}

const APPLIED_KINDS = new Set(['text', 'insert', 'image', 'diagram-fen'])

export interface ApplySuggestionsResult {
  html: string
  /** Ids of the suggestions written into the HTML. */
  applied: string[]
  /** Ids whose anchor, image or value no longer fits the chapter. */
  stale: string[]
}

/**
 * The chapter HTML with the accepted (not yet applied) text, insert, image and
 * diagram-fen suggestions written into it. Anchors are resolved on the
 * original HTML first, so the order of the changes does not move them.
 */
export function applySuggestionsToHtml(html: string, suggestions: Suggestion[]): ApplySuggestionsResult {
  const wanted = suggestions
    .filter((s) => s.status === 'accepted' && APPLIED_KINDS.has(s.kind))
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
  if (!wanted.length) return { html, applied: [], stale: [] }
  const doc = new DOMParser().parseFromString(html, 'text/html')
  const blocks = chapterBlocks(doc.body)
  const images = Array.from(doc.body.querySelectorAll('img'))
  const applied: string[] = []
  const stale: string[] = []
  const lastInserted = new Map<Element, ChildNode>()
  const changes: Array<() => void> = []
  for (const s of wanted) {
    const change = plan(s)
    if (change) { changes.push(change); applied.push(s.id) } else stale.push(s.id)
  }
  if (!applied.length) return { html, applied, stale }
  changes.forEach((c) => c())
  return { html: doc.body.innerHTML, applied, stale }

  function plan(s: Suggestion): (() => void) | null {
    if (s.kind === 'image' || s.kind === 'diagram-fen') {
      const target = s.target.image
      const matched = target ? images.filter((img) => sameImage(img.getAttribute('src') ?? '', target)) : []
      if (!matched.length) return null
      if (s.kind === 'image') {
        const src = field(s.after, 'src')
        if (!src || !safeUrl(src, true)) return null
        return () => matched.forEach((img) => img.setAttribute('src', src.trim()))
      }
      const fen = field(s.after, 'fen')?.trim()
      if (!fen || fen.length > 100 || !FEN.test(fen)) return null
      return () => matched.forEach((img) => img.setAttribute('data-fen', fen))
    }
    const block = findBlock(blocks, s.target.anchor)
    if (!block) return null
    if (s.kind === 'text') {
      const html = s.after && typeof s.after === 'object' ? field(s.after, 'html') : null
      const text = html === null ? field(s.after, 'text') : null
      if (html === null && text === null) return null
      return () => { if (html !== null) block.innerHTML = sanitizeHtml(html); else block.textContent = text }
    }
    const insert = field(s.after, 'html')
    if (insert === null) return null
    return () => {
      const holder = doc.createElement('div')
      holder.innerHTML = sanitizeHtml(insert)
      const nodes = Array.from(holder.childNodes)
      if (!nodes.length) return
      const after = lastInserted.get(block) ?? block
      after.after(...nodes)
      lastInserted.set(block, nodes[nodes.length - 1])
    }
  }
}
