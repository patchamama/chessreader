import { recognizeGames } from '@chess-ebook/chess-shared'
import type { RecognizedGame } from '@chess-ebook/chess-shared'
import { extractProseText } from '../utils/proseText'
import { initialMoves, type EditableMove } from '../correction/workbench'
import { coreMove, type ErrataEntry } from './errataFormat'
import { englishToPrinted } from './errataNotation'

/** The same red wavy underline the reader uses for a wrong move it repaired. */
export const CORRECTED_CLASS = 'errata-corrected underline decoration-wavy decoration-red-500 decoration-2'
const ORIGINAL_CLASS = 'errata-original text-slate-500'

const norm = (m: string) => coreMove(m).replace(/\s+/g, '')

/** The recognised game the entry is about: its index first, else the one whose first moves are the printed ones. */
function findGame(text: string, games: RecognizedGame[], entry: ErrataEntry): EditableMove[] | null {
  const printed = entry.original.moves.map(norm)
  const sample = Math.min(8, printed.length)
  const order = [entry.gameIndex, ...games.map((_, i) => i).filter((i) => i !== entry.gameIndex)]
  for (const i of order) {
    const game = games[i]
    if (!game) continue
    const moves = initialMoves(text, game)
    const written = moves.map((m) => norm(m.source?.written ?? m.san))
    let same = 0
    for (let k = 0; k < sample; k++) if (written[k] === printed[k]) same++
    if (sample > 0 && same >= Math.ceil(sample * 0.75)) return moves
  }
  return null
}

interface Edit { node: Text; start: number; end: number; printed: string; corrected: string; source: string }

/**
 * The chapter HTML with the corrections of its errata written in the main
 * line: each corrected move replaces the printed one (comments and variations
 * are untouched), with the red wavy underline, and the printed move follows it
 * struck through in brackets — "29 Tb1 [Rb1!?]". The bracket is marked
 * data-no-recognition, so the recogniser reads only the correction.
 */
export function applyErrataToHtml(html: string, entries: ErrataEntry[], options: { algorithm?: 1 | 2 } = {}): { html: string; applied: number } {
  if (!entries.length || !html) return { html, applied: 0 }
  const doc = new DOMParser().parseFromString(html, 'text/html')
  const prose = extractProseText(doc.body)
  const games = recognizeGames(prose.text, { algorithm: options.algorithm ?? 2 })
  const edits: Edit[] = []
  for (const entry of entries) {
    const moves = findGame(prose.text, games, entry)
    if (!moves) continue
    for (const change of entry.changes) {
      const move = moves[change.ply - 1]
      const src = move?.source
      if (!src || norm(src.written) !== norm(change.from)) continue
      // The printed evaluation marks go with the wrong move ("Bb4!?").
      let end = src.charEnd
      while (end < prose.text.length && /[!?]/.test(prose.text[end]) && prose.map[end]) end++
      const first = prose.map[src.charStart]
      const last = prose.map[end - 1]
      if (!first || !last || first.node !== last.node) continue
      edits.push({
        node: first.node, start: first.offset, end: last.offset + 1,
        printed: prose.text.slice(src.charStart, end),
        corrected: englishToPrinted(change.to, entry.original.moves),
        source: change.source,
      })
    }
  }
  if (!edits.length) return { html, applied: 0 }
  // From the end backwards: splitting a text node keeps the offsets before the cut valid.
  edits.sort((a, b) =>
    a.node === b.node ? b.start - a.start : a.node.compareDocumentPosition(b.node) & Node.DOCUMENT_POSITION_FOLLOWING ? 1 : -1)
  for (const e of edits) {
    const middle = e.node.splitText(e.start)
    middle.splitText(e.end - e.start)
    const corrected = doc.createElement('span')
    corrected.className = CORRECTED_CLASS
    corrected.setAttribute('data-errata-from', e.printed)
    corrected.setAttribute('title', `Erratum: the book prints ${e.printed}; corrected to ${e.corrected} (${e.source})`)
    corrected.textContent = e.corrected
    const original = doc.createElement('span')
    original.className = ORIGINAL_CLASS
    original.setAttribute('data-no-recognition', '')
    const del = doc.createElement('del')
    del.className = 'line-through'
    del.textContent = e.printed
    original.append(' [', del, ']')
    middle.replaceWith(corrected, original)
  }
  const body = doc.body.innerHTML
  const out = /<body[\s>]/i.test(html) ? html.replace(/(<body[^>]*>)[\s\S]*(<\/body>)/i, (_m, open: string, close: string) => open + body + close) : body
  return { html: out, applied: edits.length }
}
