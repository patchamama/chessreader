import { isMoveLine } from './isMoveLine'

/**
 * EPUBs rarely use <h1>…<h5>: their titles are paragraphs styled by a class
 * ("titulo", "subtitulo", "h2") or by inline CSS (a large, bold, centred
 * line). This reads those signals — the class names, the book's own <style>
 * rules and the inline style — and marks such paragraphs as headings
 * (role="heading" + aria-level + an `epub-hN` class the reader styles), without
 * touching their text, so move recognition is unaffected.
 */

/** Heading level (1–5) implied by CSS declarations, or null. */
export function levelFromStyle(declarations: string): number | null {
  const d = declarations.toLowerCase()
  let ratio = 1
  const size = /font-size\s*:\s*([\d.]+)\s*(em|rem|%|px|pt)/.exec(d)
  if (size) {
    const v = Number(size[1])
    ratio = size[2] === '%' ? v / 100 : size[2] === 'px' ? v / 16 : size[2] === 'pt' ? v / 12 : v
  } else {
    const kw = /font-size\s*:\s*(xx-large|x-large|larger|large)/.exec(d)
    if (kw) ratio = { 'xx-large': 2, 'x-large': 1.5, larger: 1.2, large: 1.2 }[kw[1]] ?? 1
  }
  const bold = /font-weight\s*:\s*(bold|bolder|[6-9]00)/.test(d)
  const centred = /text-align\s*:\s*center/.test(d)
  if (ratio >= 1.7) return 1
  if (ratio >= 1.35) return 2
  if (ratio >= 1.17) return 3
  if (ratio >= 1.05 && (bold || centred)) return 4
  if (bold && centred) return 5
  return null
}

/** Heading level implied by a class name alone ("h2", "titulo", "subtitle"), or null. */
export function levelFromClassName(name: string): number | null {
  const n = name.toLowerCase()
  const numbered = /^(?:h|heading|titulo|title|titre|titel|encabezado)[-_]?([1-6])$/.exec(n)
  if (numbered) return Math.min(5, Number(numbered[1]))
  if (/^(?:titulo|title|titre|titel|chapter[-_]?title|cap[ií]tulo|chapter)$/.test(n)) return 1
  if (/^(?:sub[-_]?(?:titulo|title|titre|titel)\d?|heading|encabezado|section[-_]?title)$/.test(n)) return 2
  if (/^(?:sub[-_]?heading|subsub[-_]?(?:titulo|title))$/.test(n)) return 3
  return null
}

/** Class → heading level, from the stylesheet rules of the book (`.titulo { font-size: 1.8em }`). */
export function cssHeadingClasses(css: string): Map<string, number> {
  const out = new Map<string, number>()
  const clean = css.replace(/\/\*[\s\S]*?\*\//g, '')
  for (const rule of clean.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const level = levelFromStyle(rule[2])
    if (!level) continue
    for (const selector of rule[1].split(',')) {
      const m = /\.([\w-]+)\s*$/.exec(selector.trim())
      if (!m) continue
      const prev = out.get(m[1])
      out.set(m[1], prev ? Math.min(prev, level) : level)
    }
  }
  return out
}

const BLOCK_CHILD = 'p, div, table, ul, ol, blockquote, h1, h2, h3, h4, h5, h6'

/** The heading level of one paragraph, or null when it reads as prose. */
function headingLevel(el: Element, classes: Map<string, number>): number | null {
  const text = (el.textContent ?? '').replace(/\s+/g, ' ').trim()
  if (!text || text.length > 120 || isMoveLine(text)) return null
  if (/[.:;]$/.test(text) && text.split(' ').length > 8) return null
  const inline = levelFromStyle(el.getAttribute('style') ?? '')
  if (inline) return inline
  let best: number | null = null
  for (const c of el.classList) {
    const level = classes.get(c) ?? levelFromClassName(c)
    if (level && (!best || level < best)) best = level
  }
  return best
}

/** Mark heading-like paragraphs under `root`; returns how many were marked. */
export function detectHeadings(root: Element): number {
  root.querySelectorAll('[data-epub-heading]').forEach((el) => {
    el.removeAttribute('data-epub-heading')
    el.removeAttribute('role')
    el.removeAttribute('aria-level')
    el.className = el.className.replace(/\s*\bepub-(?:heading|h[1-5])\b/g, '').trim()
  })
  const css = [...root.querySelectorAll('style')].map((s) => s.textContent ?? '').join('\n')
  const classes = cssHeadingClasses(css)
  let count = 0
  root.querySelectorAll('p, div').forEach((el) => {
    if (el.closest('[data-no-recognition], [data-game-marker]') || el.hasAttribute('role')) return
    if (el.tagName === 'DIV' && el.querySelector(BLOCK_CHILD)) return
    const level = headingLevel(el, classes)
    if (!level) return
    el.setAttribute('data-epub-heading', '')
    el.setAttribute('role', 'heading')
    el.setAttribute('aria-level', String(level))
    el.classList.add('epub-heading', `epub-h${level}`)
    count++
  })
  return count
}
