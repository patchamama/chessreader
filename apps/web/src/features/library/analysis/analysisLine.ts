import { figurineToAscii, spanishToEnglish, tokenize } from '@chess-ebook/chess-shared'
import type { AnalysisBoardInput } from './analysisBoards'
import { isDemoHost } from '../../../shared/env/devMode'

export const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'

/** Drops `{comments}`, `;comments`, `(variations)` (nested), NAGs and move numbers: the mainline SAN of a PGN. */
function mainlineSans(movetext: string): string[] {
  let depth = 0
  let flat = ''
  const text = movetext.replace(/\{[^}]*\}/g, ' ').replace(/;[^\n]*/g, ' ')
  for (const ch of text) {
    if (ch === '(') depth++
    else if (ch === ')') depth = Math.max(0, depth - 1)
    else if (depth === 0) flat += ch
  }
  return flat
    .replace(/\$\d+/g, ' ')
    .split(/\s+/)
    .map((t) => t.replace(/^\d+\.(\.\.)?/, ''))
    .filter((t) => t && !/^(1-0|0-1|1\/2-1\/2|\*)$/.test(t))
}

/** The line a board shows: from a position and its moves, or from a game's PGN (its FEN tag, else the start). */
export function boardLine(board: AnalysisBoardInput): { startFen: string; moves: string[] } {
  if (board.pgn) {
    const fen = /\[FEN\s+"([^"]+)"\]/.exec(board.pgn)?.[1]
    const movetext = board.pgn.replace(/\[[^\]]*\]/g, ' ')
    return { startFen: fen ?? START_FEN, moves: mainlineSans(movetext) }
  }
  return { startFen: board.startFen ?? START_FEN, moves: board.moves ?? [] }
}

/** The moves a comment quotes, by their offset in the text (same offsets as commentToSpeechParts). */
export function quotedMoves(text: string): Map<number, string> {
  const out = new Map<number, string>()
  for (const t of tokenize(spanishToEnglish(figurineToAscii(text)))) {
    if (t.type === 'move' && t.san) out.set(t.charStart, t.san)
  }
  return out
}

/**
 * The address of the page of a book comment's game (route `/comment/:gameId`),
 * to open in a new browser tab: under the app's base path, and behind `#` where
 * the app uses hash routing (GitHub Pages).
 */
export function commentGameHref(gameId: string, ply?: number): string {
  const path = `/comment/${encodeURIComponent(gameId)}${ply ? `?ply=${ply}` : ''}`
  const base = (import.meta.env.BASE_URL ?? '/').replace(/\/+$/, '')
  return isDemoHost() ? `${base}/#${path}` : `${base}${path}`
}
