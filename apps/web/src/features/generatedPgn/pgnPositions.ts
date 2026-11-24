import { Chess } from 'chess.js'

export interface PgnPosition { fen: string; san: string | null; from: string | null; to: string | null }

/** The positions of the main line of a PGN: the start, then one per move; null when the PGN cannot be read. */
export function pgnPositions(pgn: string): PgnPosition[] | null {
  try {
    const chess = new Chess()
    chess.loadPgn(pgn)
    const start = new Chess(chess.getHeaders().FEN ?? undefined).fen()
    return [{ fen: start, san: null, from: null, to: null }, ...chess.history({ verbose: true }).map((m) => ({ fen: m.after, san: m.san, from: m.from, to: m.to }))]
  } catch {
    return null
  }
}
