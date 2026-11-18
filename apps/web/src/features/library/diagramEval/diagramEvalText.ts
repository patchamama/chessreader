import { evalText, localLine, numberLine, shortScore, type Lang, type Score } from '@chess-ebook/chess-shared'
import { uciLineToSan } from '../review/reviewEngine'
import type { DiagramEvaluation, DiagramLine } from './diagramEvalStore'

export const DEPTH_WORD: Record<Lang, string> = { es: 'prof.', en: 'depth', de: 'Tiefe' }
const NONE: Record<Lang, string> = { es: 'Sin evaluación', en: 'No evaluation', de: 'Keine Bewertung' }

/** A side-to-move score as seen from White. */
export const fromWhite = (l: DiagramLine, fen: string): Score => {
  const sign = fen.split(' ')[1] === 'b' ? -1 : 1
  return l.mate !== undefined ? { mate: sign * l.mate } : { cp: sign * (l.scoreCp ?? 0) }
}

/** The line in the moves of the book: numbered, with the piece letters of the language. */
export function bookLine(fen: string, l: DiagramLine, lang: Lang, max: number): string {
  const sans = uciLineToSan(fen, l.pv, max)
  const [, turn, , , , moveNo] = fen.split(' ')
  return localLine(numberLine(sans, Number(moveNo) || 1, turn === 'b' ? 'black' : 'white'), lang)
}

/** Who is better and by how much, with the engine and its depth. */
export function evalWords(fen: string, e: DiagramEvaluation, lang: Lang): string | null {
  const best = e.lines[0]
  if (!best) return null
  return `${evalText(fromWhite(best, fen), lang)} · ${e.engine}, ${DEPTH_WORD[lang] ?? DEPTH_WORD.en} ${e.depth}`
}

/**
 * A diagram's evaluation as plain text, as the footer prints it: the words,
 * the engine's line, then up to two alternatives with their score.
 */
export function diagramEvalText(fen: string, e: DiagramEvaluation, lang: Lang): string {
  const words = evalWords(fen, e, lang)
  if (!words) return `${NONE[lang] ?? NONE.en}\n`
  const rows = [words, bookLine(fen, e.lines[0], lang, 6)]
  for (const l of e.lines.slice(1, 3)) rows.push(`${bookLine(fen, l, lang, 4)} (${shortScore(fromWhite(l, fen))})`)
  return `${rows.join('\n')}\n`
}
