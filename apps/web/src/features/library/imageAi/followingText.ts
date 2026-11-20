/**
 * The text printed after a diagram: what the diagram solver reads its moves
 * from. One line per block, up to the next image or heading, at most `max`
 * characters. Hidden text (a FEN line kept for the recogniser), buttons and
 * the overlays of other diagrams are skipped.
 */

const BLOCKS = new Set(['P', 'DIV', 'LI', 'UL', 'OL', 'BLOCKQUOTE', 'TABLE', 'TR', 'PRE', 'FIGURE', 'SECTION'])
const STOP = /^(IMG|H[1-6]|SVG)$/
const SKIP = new Set(['BUTTON', 'SCRIPT', 'STYLE', 'NOSCRIPT'])

export function followingTextOf(el: Element, container: Element, max = 1500): string {
  let out = ''
  let stopped = false
  const visit = (node: Node) => {
    if (stopped) return
    if (out.length >= max) { stopped = true; return }
    if (node.nodeType === Node.TEXT_NODE) { out += node.nodeValue ?? ''; return }
    if (node.nodeType !== Node.ELEMENT_NODE) return
    const e = node as Element
    const tag = e.tagName.toUpperCase()
    if (STOP.test(tag) || e.hasAttribute('data-diagram-overlay')) { stopped = true; return }
    if (SKIP.has(tag) || e.getAttribute('aria-hidden') === 'true') return
    if (tag === 'BR') { out += '\n'; return }
    const block = BLOCKS.has(tag)
    if (block) out += '\n'
    for (const child of Array.from(e.childNodes)) visit(child)
    if (block) out += '\n'
  }
  let at: Node | null = el
  while (at && at !== container && !stopped) {
    for (let s = at.nextSibling; s && !stopped; s = s.nextSibling) visit(s)
    at = at.parentNode
    if (at && at !== container && BLOCKS.has((at as Element).tagName?.toUpperCase())) out += '\n'
  }
  return out.replace(/[ \t]+/g, ' ').replace(/ *\n[\n ]*/g, '\n').slice(0, max)
}
