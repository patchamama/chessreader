import { Chess, type Color, type PieceSymbol, type Square } from 'chess.js'

/**
 * The squares of the pieces a text may mean by a bare piece move ("Ab5", "Nf3"
 * with no origin): those of that kind that reach `to` on the position, the side
 * to move first, else the other side. Empty for a pawn (a bare square names no
 * piece), a square no such piece reaches or a position that cannot be read.
 */
export function mentionOrigins(fen: string, piece: string, to: string): string[] {
  if (piece === 'p') return []
  let chess: Chess
  try { chess = new Chess(fen) } catch { return [] }
  const turn = chess.turn()
  const sides: Color[] = [turn, turn === 'w' ? 'b' : 'w']
  for (const color of sides) {
    let found: Square[]
    try { found = chess.attackers(to as Square, color) } catch { return [] }
    const own = found.filter((sq) => chess.get(sq)?.type === (piece as PieceSymbol))
    if (own.length) return own.sort()
  }
  return []
}
