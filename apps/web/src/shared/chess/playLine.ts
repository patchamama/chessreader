import { Chess } from 'chess.js'

/** A move of a line with the position after it (for its thumbnail and replay). */
export interface LinePosition { fen: string; from: string; to: string; san: string }

const UCI = /^[a-h][1-8][a-h][1-8][qrbn]?$/

/**
 * Plays a line (SAN or UCI moves) from a position. `ok` is false when the
 * position or a move is not legal: `positions` then holds the moves up to it.
 */
export function playLine(fen: string, moves: string[], max = Infinity): { positions: LinePosition[]; ok: boolean } {
  const positions: LinePosition[] = []
  let chess: Chess
  try { chess = new Chess(fen) } catch { return { positions, ok: false } }
  for (const m of moves.slice(0, max)) {
    try {
      const done = UCI.test(m)
        ? chess.move({ from: m.slice(0, 2), to: m.slice(2, 4), promotion: m[4] ?? 'q' })
        : chess.move(m.replace(/[!?]+$/, ''))
      positions.push({ fen: chess.fen(), from: done.from, to: done.to, san: done.san })
    } catch {
      return { positions, ok: false }
    }
  }
  return { positions, ok: true }
}
