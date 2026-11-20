const GLYPH: Record<string, string> = {
  P: '♙', N: '♘', B: '♗', R: '♖', Q: '♕', K: '♔',
  p: '♟', n: '♞', b: '♝', r: '♜', q: '♛', k: '♚',
}

const counts = (fen: string): Map<string, number> => {
  const m = new Map<string, number>()
  for (const ch of fen.split(' ')[0] ?? '') if (/[pnbrqkPNBRQK]/.test(ch)) m.set(ch, (m.get(ch) ?? 0) + 1)
  return m
}

/**
 * The piece a move took, as a FEN letter (upper case = White's), from the
 * positions before and after it; null for a move that took nothing. Only the
 * side that did not move can lose a piece, so a promotion is not a capture.
 */
export function capturedPiece(fenBefore: string, fenAfter: string): string | null {
  const moverWhite = (fenBefore.split(' ')[1] ?? 'w') === 'w'
  const before = counts(fenBefore)
  const after = counts(fenAfter)
  for (const piece of moverWhite ? 'pnbrq' : 'PNBRQ') {
    if ((after.get(piece) ?? 0) < (before.get(piece) ?? 0)) return piece
  }
  return null
}

/** The glyph of a FEN piece letter (♞ for "n"). */
export const pieceGlyph = (piece: string): string => GLYPH[piece] ?? piece
