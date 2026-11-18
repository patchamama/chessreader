import { Chess, type Square } from 'chess.js'

const START: Record<string, number> = { p: 8, n: 2, b: 2, r: 2, q: 1 }
const ORDER = 'qrbnp'

/**
 * The pieces each side has taken, from the pieces missing on the board:
 * `white` holds the black pieces White took (lower case), `black` the white
 * pieces Black took (upper case), most valuable first.
 */
export function capturedPieces(fen: string): { white: string[]; black: string[] } {
  const board = fen.split(' ')[0]
  const count = (ch: string) => [...board].filter((x) => x === ch).length
  const white: string[] = []
  const black: string[] = []
  for (const p of ORDER) {
    for (let i = count(p); i < START[p]; i++) white.push(p)
    for (let i = count(p.toUpperCase()); i < START[p]; i++) black.push(p.toUpperCase())
  }
  return { white, black }
}

const GLYPH: Record<string, string> = { p: '♟', n: '♞', b: '♝', r: '♜', q: '♛' }
/** A captured piece as a small figurine. */
export const pieceGlyph = (p: string) => GLYPH[p.toLowerCase()] ?? p

/** The legal destinations of the piece on `square`, when it belongs to the side to move. */
export function legalTargets(fen: string, square: string): string[] {
  try {
    const c = new Chess(fen)
    const piece = c.get(square as Square)
    if (!piece || piece.color !== c.turn()) return []
    return c.moves({ square: square as Square, verbose: true }).map((m) => m.to)
  } catch { return [] }
}
