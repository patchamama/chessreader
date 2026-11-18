import { Chess, validateFen, type Color, type Square } from 'chess.js'

/**
 * Whether Stockfish can be given this position. A broken FEN, a missing king or
 * a position where the side that just moved is still in check makes the
 * WebAssembly engine abort ("RuntimeError: unreachable") and stop answering.
 */
export function engineSafeFen(fen: string | null | undefined): boolean {
  if (!fen || !validateFen(fen).ok) return false
  try {
    const chess = new Chess(fen)
    const board = chess.board().flat()
    const king = (c: Color) => board.find((p) => p?.type === 'k' && p.color === c)
    if (!king('w') || !king('b')) return false
    const toMove = chess.turn()
    const other: Color = toMove === 'w' ? 'b' : 'w'
    return !chess.isAttacked(king(other)!.square as Square, toMove)
  } catch {
    return false
  }
}
