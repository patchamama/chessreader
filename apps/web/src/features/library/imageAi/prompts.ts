import type { SquareReading } from '@chess-ebook/chess-shared'
import type { LlmRequest } from '../../../shared/llm'
import { sanitizeHtml } from '../../suggestions/suggestionApply'

/**
 * The prompts of the image AI actions and the strict checks of their answers.
 * Nothing the model writes reaches the page without `cleanAiHtml` (the
 * suggestions sanitiser plus a whitelist: no SVG, no images, no attributes).
 */

const withImage = (system: string, text: string, image: string, json = false): LlmRequest => ({
  system,
  messages: [{ role: 'user', text, images: [image] }],
  ...(json ? { json: true } : {}),
  maxTokens: 4096,
})

const HTML_RULES = 'Answer with an HTML fragment only, using just these tags: table, thead, tbody, tr, th, td, ul, ol, li, p, h4, strong, em, br. No SVG, no images, no scripts, no styles, no attributes except colspan and rowspan.'

/** Describe or extract: a table or flowchart as an HTML table or list, plus its text. */
export function describePrompt(image: string): LlmRequest {
  return withImage(
    `You transcribe images of a chess book. ${HTML_RULES}`,
    'Extract the information of this image. A table becomes an HTML table; a flowchart or diagram becomes a nested list of its boxes and arrows (from → to); any other text is kept as paragraphs. Keep the original language.',
    image,
  )
}

/** Redraw clearly: the same content as clean markup (a table or list), never raw SVG. */
export function redrawPrompt(image: string): LlmRequest {
  return withImage(
    `You redraw unclear figures of a chess book as clean, readable markup. ${HTML_RULES} No SVG.`,
    'Redraw this figure clearly: the same structure as a well-organised table, or a nested list for a flowchart (one item per box, its arrows as sub-items "→ target"). Keep every label and the original language.',
    image,
  )
}

/** Read a chess diagram: 64 squares with a piece letter (or null) and a confidence, and the side to move. */
export function fenPrompt(image: string): LlmRequest {
  return withImage(
    'You read chess diagrams. Answer only JSON: {"sideToMove": "w" | "b" | null, "squares": [{"square": "a8", "piece": "r", "confidence": 0.9}, …]} with exactly 64 entries, one per square a1..h8. piece is a FEN letter (uppercase white, lowercase black: K Q R B N P / k q r b n p) or null for an empty square. confidence is how sure you are, from 0 to 1. White is at the bottom unless the coordinates say otherwise.',
    'Read every square of this chess diagram.',
    image,
    true,
  )
}

export type VisionBoard =
  | { ok: true; readings: SquareReading[]; sideToMove: 'w' | 'b' | null }
  | { ok: false; error: string }

/** The JSON object of an answer: as it is, or inside a code fence, or the first {...} of the text. */
function jsonOf(text: string): unknown {
  const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(text)?.[1]
  const body = (fenced ?? text).trim()
  try { return JSON.parse(body) } catch { /* the object inside the prose */ }
  const start = body.indexOf('{'), end = body.lastIndexOf('}')
  if (start < 0 || end <= start) throw new Error('the answer is not JSON')
  return JSON.parse(body.slice(start, end + 1))
}

const PIECE = /^[KQRBNPkqrbnp]$/
const SQUARE = /^[a-h][1-8]$/

/** A vision model's board, strictly checked: 64 distinct squares, FEN letters or null, confidences 0..1. */
export function parseVisionBoard(text: string): VisionBoard {
  let value: unknown
  try { value = jsonOf(text) } catch (e) { return { ok: false, error: `not a board: ${(e as Error).message}` } }
  if (!value || typeof value !== 'object' || Array.isArray(value)) return { ok: false, error: 'not a board: expected a JSON object' }
  const v = value as Record<string, unknown>
  const side = v.sideToMove ?? null
  if (side !== null && side !== 'w' && side !== 'b') return { ok: false, error: 'sideToMove must be "w", "b" or null' }
  if (!Array.isArray(v.squares) || v.squares.length !== 64) return { ok: false, error: 'squares must list the 64 squares' }
  const seen = new Set<string>()
  const readings: SquareReading[] = []
  for (const item of v.squares as unknown[]) {
    const s = item as Record<string, unknown> | null
    if (!s || typeof s !== 'object') return { ok: false, error: 'each square must be an object' }
    if (typeof s.square !== 'string' || !SQUARE.test(s.square)) return { ok: false, error: `bad square ${JSON.stringify(s.square)}` }
    if (seen.has(s.square)) return { ok: false, error: `square ${s.square} is given twice` }
    seen.add(s.square)
    if (s.piece !== null && (typeof s.piece !== 'string' || !PIECE.test(s.piece))) return { ok: false, error: `bad piece ${JSON.stringify(s.piece)} on ${s.square}` }
    if (typeof s.confidence !== 'number' || !Number.isFinite(s.confidence) || s.confidence < 0 || s.confidence > 1) {
      return { ok: false, error: `confidence of ${s.square} must be a number from 0 to 1` }
    }
    readings.push({ square: s.square, piece: s.piece as string | null, confidence: s.confidence })
  }
  return { ok: true, readings, sideToMove: side }
}

const ALLOWED = new Set(['TABLE', 'THEAD', 'TBODY', 'TFOOT', 'TR', 'TH', 'TD', 'CAPTION', 'UL', 'OL', 'LI', 'P', 'H4', 'H5', 'STRONG', 'EM', 'B', 'I', 'BR', 'SPAN', 'DIV', 'CODE', 'PRE'])
const KEPT_ATTRS = new Set(['colspan', 'rowspan'])

/** AI HTML made safe for a chapter: sanitised, then only the whitelisted tags (others unwrapped, SVG/images dropped) and no attributes but colspan/rowspan. */
export function cleanAiHtml(html: string): string {
  const body = new DOMParser().parseFromString(`<body>${sanitizeHtml(html)}</body>`, 'text/html').body
  body.querySelectorAll('svg, math, img, picture, video, audio, canvas, source, iframe').forEach((el) => el.remove())
  for (const el of Array.from(body.querySelectorAll('*')).reverse()) {
    if (!ALLOWED.has(el.tagName.toUpperCase())) { el.replaceWith(...Array.from(el.childNodes)); continue }
    for (const attr of Array.from(el.attributes)) if (!KEPT_ATTRS.has(attr.name.toLowerCase()) || !/^\d{1,3}$/.test(attr.value)) el.removeAttribute(attr.name)
  }
  return body.innerHTML.trim()
}

const escape = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
const inline = (s: string) => escape(s.trim()).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>').replace(/(^|[^*])\*([^*]+)\*/g, '$1<em>$2</em>')
const cells = (line: string) => line.trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim())

/** A Markdown answer (tables, lists, headings, paragraphs) as HTML. */
function markdownToHtml(md: string): string {
  const out: string[] = []
  for (const block of md.trim().split(/\n\s*\n/)) {
    const lines = block.split('\n').filter((l) => l.trim())
    if (!lines.length) continue
    if (lines.length >= 2 && lines.every((l) => l.trim().startsWith('|')) && /^\s*\|?[\s:|-]+\|?\s*$/.test(lines[1])) {
      const head = cells(lines[0]).map((c) => `<th>${inline(c)}</th>`).join('')
      const rows = lines.slice(2).map((l) => `<tr>${cells(l).map((c) => `<td>${inline(c)}</td>`).join('')}</tr>`).join('')
      out.push(`<table><thead><tr>${head}</tr></thead><tbody>${rows}</tbody></table>`)
    } else if (lines.every((l) => /^\s*[-*]\s+/.test(l))) {
      out.push(`<ul>${lines.map((l) => `<li>${inline(l.replace(/^\s*[-*]\s+/, ''))}</li>`).join('')}</ul>`)
    } else if (lines.every((l) => /^\s*\d+[.)]\s+/.test(l))) {
      out.push(`<ol>${lines.map((l) => `<li>${inline(l.replace(/^\s*\d+[.)]\s+/, ''))}</li>`).join('')}</ol>`)
    } else if (lines.length === 1 && /^#{1,6}\s/.test(lines[0])) {
      out.push(`<h4>${inline(lines[0].replace(/^#{1,6}\s+/, ''))}</h4>`)
    } else {
      out.push(`<p>${lines.map(inline).join('<br>')}</p>`)
    }
  }
  return out.join('')
}

/** A model's answer as safe HTML: an HTML answer (maybe in a code fence) cleaned, a Markdown one converted then cleaned. */
export function aiTextToHtml(text: string): string {
  const fenced = /```(?:html|markdown|md)?\s*([\s\S]*?)```/i.exec(text)?.[1]
  const body = (fenced ?? text).trim()
  const isHtml = /<(table|ul|ol|p|h\d|div|tr|li)\b/i.test(body)
  return cleanAiHtml(isHtml ? body : markdownToHtml(body))
}
