import { Chess } from 'chess.js'
import type { PlyInput, Score } from '@chess-ebook/chess-shared'

/** Plies of a built game (tests): `evals` are White's view of each position, the start included. */
export function buildPlies(sans: string[], evals: Score[], startFen?: string): PlyInput[] {
  const chess = startFen ? new Chess(startFen) : new Chess()
  return sans.map((san, i) => {
    const fenBefore = chess.fen()
    const color = chess.turn() === 'w' ? 'white' : 'black'
    const moveNumber = chess.moveNumber()
    const move = chess.move(san)
    return { nodeId: `n${i}`, san: move.san, color, moveNumber, from: move.from, to: move.to, fenBefore, fenAfter: chess.fen(), before: evals[i], after: evals[i + 1] }
  })
}

/** The same evaluation for every position except the ones given by index. */
export function flat(n: number, cp: number, over: Record<number, Score> = {}): Score[] {
  return Array.from({ length: n + 1 }, (_, i) => over[i] ?? { cp })
}
