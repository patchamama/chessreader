import { strFromU8, unzipSync } from 'fflate'

/**
 * An EPUB read in the browser the way the server reads it
 * (apps/api Infrastructure/Epub): the spine documents named from the table of
 * contents or their heading, each with the book's stylesheet scoped to the
 * reader's content and its images turned into URLs the browser can load.
 */

/** Joins the lines of a chapter title (the API's TocLabel::SEPARATOR). */
const TITLE_SEPARATOR = ' — '

/** Every selector of the book CSS applies only inside the reader's content. */
export const EPUB_CSS_SCOPE = ':where(.epub-content)'

export interface EpubChapter {
  /** Archive path of the spine document. */
  path: string
  title: string
  /** `<style data-epub-stylesheet>` with the scoped book CSS, then the body. */
  html: string
}

export interface ParseEpubOptions {
  /**
   * The URL an image is shown from (bytes, media type, archive path). Defaults
   * to an object URL, or a data URL where the browser cannot make one.
   */
  imageUrl?: (bytes: Uint8Array, type: string, path: string) => string
}

const IMAGE_TYPES: Record<string, string> = {
  png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', svg: 'image/svg+xml',
}

function defaultImageUrl(bytes: Uint8Array, type: string): string {
  if (typeof URL !== 'undefined' && typeof URL.createObjectURL === 'function') {
    return URL.createObjectURL(new Blob([bytes as BlobPart], { type }))
  }
  let binary = ''
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return `data:${type};base64,${btoa(binary)}`
}

/** Collapse "." and "dir/../" segments so paths match archive entry names. */
function normalize(path: string): string {
  const parts: string[] = []
  for (const seg of path.split('/')) {
    if (seg === '' || seg === '.') continue
    if (seg === '..') parts.pop()
    else parts.push(seg)
  }
  return parts.join('/')
}

/** Resolve an href (URL-encoded, maybe with "../" or a fragment) against an archive directory. */
function resolve(baseDir: string, href: string): string {
  let h = href.split('#')[0]
  try { h = decodeURIComponent(h) } catch { /* a stray "%": keep it as written */ }
  return normalize(h.startsWith('/') ? h : `${baseDir ? `${baseDir}/` : ''}${h}`)
}

const dirOf = (path: string) => (path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : '')

const isAbsoluteUrl = (href: string) => /^[a-z][a-z0-9+.-]*:/i.test(href)

function parseXml(text: string): Document | null {
  const doc = new DOMParser().parseFromString(text, 'application/xml')
  return doc.getElementsByTagName('parsererror').length ? null : doc
}

/** An XHTML document, tolerating one that is only HTML. */
function parseXhtml(text: string): Document {
  const doc = new DOMParser().parseFromString(text, 'application/xhtml+xml')
  return doc.getElementsByTagName('parsererror').length ? new DOMParser().parseFromString(text, 'text/html') : doc
}

const byLocalName = (root: Document | Element, name: string) =>
  [...root.getElementsByTagName('*')].filter((e) => e.localName === name)

const firstChild = (el: Element, name: string) => [...el.children].find((c) => c.localName === name) ?? null

const clean = (line: string) => line.replace(/\s+/gu, ' ').trim()

/** Lines of an element's text, a <br> starting a new line. */
function linesOf(el: Element): string[] {
  let buffer = ''
  const walk = (n: Node) => {
    n.childNodes.forEach((c) => {
      if (c.nodeType === Node.ELEMENT_NODE && (c as Element).localName.toLowerCase() === 'br') buffer += '\n'
      else if (c.nodeType === Node.TEXT_NODE) buffer += (c as Text).data.replace(/\s+/gu, ' ')
      else walk(c)
    })
  }
  walk(el)
  return buffer.split('\n').map(clean).filter(Boolean)
}

const fromLines = (lines: string[]) => lines.map(clean).filter(Boolean).join(TITLE_SEPARATOR)

const sameWords = (a: string, b: string) => clean(a).toLowerCase() === clean(b).toLowerCase()

interface Opf {
  title: string
  manifest: Map<string, string>
  spine: string[]
  nav: string | null
  ncx: string | null
}

function parseOpf(xml: string): Opf | null {
  const doc = parseXml(xml)
  if (!doc) return null
  const manifest = new Map<string, string>()
  let nav: string | null = null
  let ncxByType: string | null = null
  for (const item of byLocalName(doc, 'item')) {
    const id = item.getAttribute('id') ?? ''
    const href = item.getAttribute('href') ?? ''
    if (!id || !href) continue
    manifest.set(id, href)
    if (nav === null && (item.getAttribute('properties') ?? '').split(/\s+/).includes('nav')) nav = href
    if (ncxByType === null && item.getAttribute('media-type') === 'application/x-dtbncx+xml') ncxByType = href
  }
  const spineEl = byLocalName(doc, 'spine')[0]
  const spine = byLocalName(doc, 'itemref').map((i) => i.getAttribute('idref') ?? '').filter(Boolean)
  const tocId = spineEl?.getAttribute('toc')
  const ncx = (tocId && manifest.get(tocId)) || ncxByType
  return { title: clean(byLocalName(doc, 'title')[0]?.textContent ?? ''), manifest, spine, nav, ncx }
}

/** TOC entries (href relative to the TOC document, title) of an EPUB 3 nav document. */
function navEntries(text: string): { href: string; title: string }[] {
  const doc = parseXhtml(text)
  const navs = byLocalName(doc, 'nav')
  const toc = navs.find((n) => (n.getAttributeNS('http://www.idpf.org/2007/ops', 'type') || n.getAttribute('epub:type') || '').split(/\s+/).includes('toc')) ?? navs[0]
  if (!toc) return []
  return byLocalName(toc, 'a').filter((a) => a.hasAttribute('href'))
    .map((a) => ({ href: (a.getAttribute('href') ?? '').split('#')[0], title: fromLines(linesOf(a)) }))
}

/** TOC entries of an EPUB 2 NCX: every navPoint, nested ones included, by playOrder. */
function ncxEntries(text: string): { href: string; title: string }[] {
  const doc = parseXml(text)
  if (!doc) return []
  const points = byLocalName(doc, 'navPoint').map((p, i) => {
    const label = firstChild(p, 'navLabel')
    const textEl = label ? firstChild(label, 'text') : null
    const content = firstChild(p, 'content')
    return {
      order: Number(p.getAttribute('playOrder')) || i + 1,
      title: fromLines(((textEl ?? label)?.textContent ?? '').split(/\r?\n/)),
      href: (content?.getAttribute('src') ?? '').split('#')[0],
    }
  })
  return points.sort((a, b) => a.order - b.order)
}

/** Lines of the document's first h1–h3 heading. */
function headingLines(doc: Document): string[] {
  const heading = [...doc.getElementsByTagName('*')].find((e) => /^h[1-3]$/i.test(e.localName))
  return heading ? linesOf(heading) : []
}

function matchingBrace(css: string, open: number): number {
  let depth = 0
  for (let j = open; j < css.length; j++) {
    if (css[j] === '{') depth++
    else if (css[j] === '}' && --depth === 0) return j
  }
  return css.length
}

function scopeRules(css: string, scope: string): string {
  const out: string[] = []
  let i = 0
  while (i < css.length) {
    const open = css.indexOf('{', i)
    if (open < 0) break
    const prelude = css.slice(i, open).trim()
    const close = matchingBrace(css, open)
    const body = css.slice(open + 1, close)
    i = close + 1
    if (prelude.startsWith('@')) {
      if (/^@(?:media|supports)\b/i.test(prelude)) {
        const inner = scopeRules(body, scope)
        if (inner) out.push(`${prelude} {\n${inner}\n}`)
      }
      // @font-face, @page, @keyframes… do not apply to the reader.
      continue
    }
    const declarations = body.split(';').map((d) => d.trim())
      .filter((d) => d && !/url\(|expression\(/i.test(d)).join('; ')
    if (!prelude || !declarations) continue
    const selectors = prelude.split(',').map((s) => {
      const sel = s.trim()
      // html / body (alone or as the first compound) are the content root.
      const rest = sel.replace(/^(?:html\b[^\s>+~]*\s*)?(?:body\b[^\s>+~]*)?\s*/i, '')
      if (rest !== sel) return rest === '' ? scope : `${scope} ${rest}`
      return `${scope} ${sel}`
    })
    out.push(`${selectors.join(', ')} {${declarations}}`)
  }
  return out.join('\n')
}

/**
 * An EPUB stylesheet rewritten to apply only inside the reader's content (as
 * the API's EpubCssScoper): selectors prefixed with `:where(.epub-content)`,
 * html/body as the content root, imports, fonts and url() references dropped.
 */
export function scopeEpubCss(css: string, scope: string = EPUB_CSS_SCOPE): string {
  const stripped = css.replace(/\/\*[\s\S]*?\*\//g, '').replace(/@(?:charset|import|namespace)\b[^;]*;/gi, '')
  // The CSS ends up inside a <style> element: it must not be able to close it.
  return scopeRules(stripped, scope).replace(/<(?=\/?\s*style)/gi, '\\3C ')
}

/** Read an EPUB file: its title and its spine documents as the chapters the reader shows. */
export function parseEpub(bytes: Uint8Array, options: ParseEpubOptions = {}): { title: string; chapters: EpubChapter[] } {
  const files = unzipSync(bytes)
  const read = (path: string): Uint8Array | null => files[path] ?? null
  const readText = (path: string): string | null => {
    const data = read(path)
    return data ? strFromU8(data) : null
  }

  const container = readText('META-INF/container.xml')
  const containerDoc = container ? parseXml(container) : null
  const rootfile = containerDoc ? byLocalName(containerDoc, 'rootfile')[0] : undefined
  const opfPath = normalize(rootfile?.getAttribute('full-path') ?? '')
  const opfXml = opfPath ? readText(opfPath) : null
  const opf = opfXml ? parseOpf(opfXml) : null
  if (!opf) throw new Error('Not an EPUB: no package document')
  const opfDir = dirOf(opfPath)

  // Archive path → title of the first TOC entry pointing at it (nav, else NCX).
  const toc = new Map<string, string>()
  const tocFrom = (href: string | null, parse: (t: string) => { href: string; title: string }[]) => {
    if (!href) return false
    const tocPath = resolve(opfDir, href)
    const text = readText(tocPath)
    const entries = text ? parse(text) : []
    for (const e of entries) {
      if (!e.href || !e.title) continue
      const path = resolve(dirOf(tocPath), e.href)
      if (!toc.has(path)) toc.set(path, e.title)
    }
    return entries.length > 0
  }
  if (!tocFrom(opf.nav, navEntries)) tocFrom(opf.ncx ?? opf.manifest.get('ncx') ?? 'toc.ncx', ncxEntries)

  const makeUrl = options.imageUrl ?? defaultImageUrl
  const imageUrls = new Map<string, string | null>()
  const imageUrl = (path: string): string | null => {
    if (!imageUrls.has(path)) {
      const data = read(path)
      const type = IMAGE_TYPES[path.split('.').pop()?.toLowerCase() ?? '']
      imageUrls.set(path, data && type ? makeUrl(data, type, path) : null)
    }
    return imageUrls.get(path) ?? null
  }

  const htmlDoc = document.implementation.createHTMLDocument('')
  const chapters: EpubChapter[] = []
  let parent: string | null = null
  let part = 1
  for (const idref of opf.spine) {
    const href = opf.manifest.get(idref)
    if (href === undefined) continue
    const path = resolve(opfDir, href)
    const doc = parseXhtml(readText(path) ?? '')
    const lines = headingLines(doc)
    const label = toc.get(path)

    let title: string
    if (label) {
      // The TOC label printed on one line while the heading breaks it into lines: keep the heading's lines.
      title = lines.length > 1 && sameWords(lines.join(' '), label.split(TITLE_SEPARATOR).join(' ')) ? fromLines(lines) : label
    } else if (lines.length) {
      title = fromLines(lines)
    } else if (parent !== null) {
      // A part with no TOC entry and no heading continues the chapter before it.
      title = `${parent} (${++part})`
    } else {
      title = `Chapter ${chapters.length + 1}`
    }
    if (label || lines.length) { parent = title; part = 1 }

    chapters.push({ path, title, html: chapterHtml(doc, dirOf(path), readText, imageUrl, htmlDoc) })
  }
  return { title: opf.title, chapters }
}

/** The chapter body (images pointed at their URLs) after a <style> with its scoped stylesheets. */
function chapterHtml(
  doc: Document, dir: string, readText: (path: string) => string | null, imageUrl: (path: string) => string | null, htmlDoc: Document,
): string {
  const head = byLocalName(doc, 'head')[0]
  const sheets: string[] = []
  if (head) {
    for (const el of [...head.children]) {
      const name = el.localName.toLowerCase()
      const href = el.getAttribute('href') ?? ''
      if (name === 'link' && /stylesheet/i.test(el.getAttribute('rel') ?? '') && href && !isAbsoluteUrl(href)) {
        const css = readText(resolve(dir, href))
        if (css) sheets.push(css)
      } else if (name === 'style' && (el.textContent ?? '').trim()) {
        sheets.push(el.textContent ?? '')
      }
    }
  }
  const css = sheets.map((s) => scopeEpubCss(s)).join('\n').trim()

  const body = byLocalName(doc, 'body')[0]
  if (!body) return css ? `<style data-epub-stylesheet="1">${css}</style>` : ''
  // Serialised as HTML (an empty <div/> stays an empty div).
  const container = htmlDoc.createElement('div')
  body.childNodes.forEach((n) => container.appendChild(htmlDoc.importNode(n, true)))
  for (const el of [...container.getElementsByTagName('*')]) {
    const name = el.localName.toLowerCase()
    if (name === 'img') {
      const src = el.getAttribute('src')
      const url = src && !isAbsoluteUrl(src) ? imageUrl(resolve(dir, src)) : null
      if (url) el.setAttribute('src', url)
    } else if (name === 'image') {
      const XLINK = 'http://www.w3.org/1999/xlink'
      const src = el.getAttributeNS(XLINK, 'href') ?? el.getAttribute('xlink:href') ?? el.getAttribute('href')
      const url = src && !isAbsoluteUrl(src) ? imageUrl(resolve(dir, src)) : null
      if (url) {
        if (el.hasAttributeNS(XLINK, 'href')) el.setAttributeNS(XLINK, 'xlink:href', url)
        else if (el.hasAttribute('xlink:href')) el.setAttribute('xlink:href', url)
        else el.setAttribute('href', url)
      }
    }
  }
  return (css ? `<style data-epub-stylesheet="1">${css}</style>` : '') + container.innerHTML
}
