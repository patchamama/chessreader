import { Chess } from 'chess.js'

/** One analysed move of the comment map (S20): the piece, where it goes and how many comments the resulting position has. */
export interface MapResult { piece: string; from: string; to: string; san: string; count: number }
export interface LegalMove { piece: string; from: string; to: string; san: string; after: string }
export interface SquareCount { count: number; /** The pieces (letters) that can reach the square, in the order analysed. */ pieces: string[] }

/** Every legal move of the side to move, grouped by piece (by square); promotions count the queen only. */
export function legalMoves(fen: string): LegalMove[] {
  let chess: Chess
  try { chess = new Chess(fen) } catch { return [] }
  return chess.moves({ verbose: true })
    .filter((m) => !m.promotion || m.promotion === 'q')
    .map((m) => ({ piece: m.piece.toUpperCase(), from: m.from, to: m.to, san: m.san, after: m.after }))
    .sort((a, b) => (a.from < b.from ? -1 : a.from > b.from ? 1 : 0))
}

/**
 * Analyses every legal move of a position, piece after piece, with a bounded number of
 * counts at a time; `onResult` hears each move as soon as it is counted. Cancel with the signal.
 */
export async function analyseMoves(
  fen: string,
  count: (fen: string) => Promise<number>,
  opts: { onResult: (r: MapResult, done: number, total: number) => void; signal?: AbortSignal; concurrency?: number },
): Promise<void> {
  const moves = legalMoves(fen)
  let next = 0
  let done = 0
  const worker = async () => {
    while (!opts.signal?.aborted) {
      const m = moves[next++]
      if (!m) return
      let n = 0
      try { n = await count(m.after) } catch { n = 0 }
      if (opts.signal?.aborted) return
      opts.onResult({ piece: m.piece, from: m.from, to: m.to, san: m.san, count: n }, ++done, moves.length)
    }
  }
  await Promise.all(Array.from({ length: Math.max(1, Math.min(opts.concurrency ?? 4, moves.length || 1)) }, worker))
}

/** "Per move": on each square the best single move that reaches it, without summing. */
export function perMoveView(results: MapResult[]): Map<string, SquareCount> {
  const out = new Map<string, SquareCount>()
  for (const r of results) {
    const cur = out.get(r.to)
    if (!cur || r.count > cur.count) out.set(r.to, { count: r.count, pieces: [r.piece] })
    else if (r.count === cur.count && !cur.pieces.includes(r.piece)) cur.pieces.push(r.piece)
  }
  return out
}

/** "Accumulated": on each square the counts of every move that reaches it, summed, with the pieces analysed so far. */
export function accumulatedView(results: MapResult[]): Map<string, SquareCount> {
  const out = new Map<string, SquareCount>()
  for (const r of results) {
    const cur = out.get(r.to) ?? { count: 0, pieces: [] }
    cur.count += r.count
    if (!cur.pieces.includes(r.piece)) cur.pieces.push(r.piece)
    out.set(r.to, cur)
  }
  return out
}
