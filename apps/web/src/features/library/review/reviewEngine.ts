import { Chess } from 'chess.js'
import { winPercent } from '@chess-ebook/chess-shared'
import type { GameTree, PlyInput, Score } from '@chess-ebook/chess-shared'
import { createStockfishWorker } from '../../../shared/stockfish/stockfishWorker'
import type { EngineLine } from '../../../shared/stockfish/useEngineLines'

/** Ask the engine for the best `count` lines of a position (scores for the side to move). */
export type AnalysePosition = (fen: string, depth: number, count: number) => Promise<EngineLine[]>

/** An engine that answers one position at a time, on its own worker. */
export function createEngineAnalyser(sfUrl?: string): { analyse: AnalysePosition; dispose: () => void } {
  let worker: Worker | null = null
  let queue: Promise<unknown> = Promise.resolve()
  const ask = (fen: string, depth: number, count: number) =>
    new Promise<EngineLine[]>((resolve) => {
      if (!worker) worker = createStockfishWorker(sfUrl)
      const w = worker
      let last: EngineLine[] = []
      const timer = setTimeout(() => finish(), 30000)
      const finish = () => { clearTimeout(timer); w.removeEventListener('message', onMessage); resolve(last) }
      const onMessage = (e: MessageEvent) => {
        const data = typeof e.data === 'string' ? JSON.parse(e.data) : e.data
        if (data.type === 'error') { finish(); return }
        if (data.type !== 'lines' || data.fen !== fen) return
        last = data.lines
        if (data.final) finish()
      }
      w.addEventListener('message', onMessage)
      w.postMessage({ type: 'lines', fen, depth, count })
    })
  return {
    analyse: (fen, depth, count) => {
      const next = queue.then(() => ask(fen, depth, count))
      queue = next.catch(() => undefined)
      return next
    },
    dispose: () => { worker?.terminate(); worker = null },
  }
}

/** A line of UCI moves as SAN, from `fen` (stops at the first move that does not fit). */
export function uciLineToSan(fen: string, uci: string[], max = 8): string[] {
  const chess = new Chess(fen)
  const out: string[] = []
  for (const move of uci.slice(0, max)) {
    try {
      out.push(chess.move({ from: move.slice(0, 2), to: move.slice(2, 4), promotion: move[4] ?? 'q' }).san)
    } catch {
      break
    }
  }
  return out
}

const toWhite = (line: EngineLine | undefined, whiteToMove: boolean): Score => {
  if (!line) return { cp: 0 }
  const sign = whiteToMove ? 1 : -1
  return line.mate !== undefined ? { mate: sign * line.mate } : { cp: sign * (line.scoreCp ?? 0) || 0 }
}

export interface AnalyseOptions {
  depth: number
  /** Called after each position: positions done, positions in all. */
  onProgress?: (done: number, total: number) => void
  signal?: AbortSignal
}

/** Runs the engine over every position of the game's main line. */
export async function analyseGame(tree: GameTree, analyse: AnalysePosition, options: AnalyseOptions): Promise<PlyInput[]> {
  const nodes = tree.mainline.map((id) => tree.nodes.get(id)!).filter((n) => !n.invalid)
  const fens = [tree.startFen, ...nodes.map((n) => n.fen)]
  const scores: Score[] = []
  const best: Array<{ san: string; line: string[] } | undefined> = []
  for (let i = 0; i < fens.length; i++) {
    if (options.signal?.aborted) throw new Error('aborted')
    const chess = new Chess(fens[i])
    const whiteToMove = chess.turn() === 'w'
    if (chess.isCheckmate()) {
      scores.push({ mate: whiteToMove ? -1 : 1 })
      best.push(undefined)
    } else if (chess.isGameOver()) {
      scores.push({ cp: 0 })
      best.push(undefined)
    } else {
      const [line] = await analyse(fens[i], options.depth, 1)
      if (options.signal?.aborted) throw new Error('aborted')
      scores.push(toWhite(line, whiteToMove))
      const san = uciLineToSan(fens[i], line?.pv ?? [])
      best.push(san.length ? { san: san[0], line: san } : undefined)
    }
    options.onProgress?.(i + 1, fens.length)
  }
  // Consistency: the side to move could at least play the move of the game, so
  // a position is never worse for it than the position that move leads to. A
  // shallow search that missed the point is corrected by what came next.
  for (let i = fens.length - 2; i >= 0; i--) {
    const whiteToMove = fens[i].split(' ')[1] === 'w'
    const here = winPercent(scores[i])
    const next = winPercent(scores[i + 1])
    if (whiteToMove ? here < next : here > next) scores[i] = scores[i + 1]
  }
  return nodes.map((n, i) => ({
    nodeId: n.id, san: n.san, color: n.color, moveNumber: n.moveNumber, from: n.from, to: n.to,
    fenBefore: fens[i], fenAfter: n.fen, before: scores[i], after: scores[i + 1], best: best[i],
  }))
}

export type MoveHint = 'good' | 'dubious' | 'bad'

/**
 * How good each destination of the piece on `square` is, given the engine's
 * lines for EVERY legal move of the position: measured by the winning chances
 * it gives away against the best move.
 */
export function hintsForSquare(lines: EngineLine[], fen: string, square: string): Record<string, MoveHint> {
  const whiteToMove = fen.split(' ')[1] === 'w'
  const win = (l: EngineLine) => {
    const w = winPercent(toWhite(l, whiteToMove))
    return whiteToMove ? w : 100 - w
  }
  const top = Math.max(...lines.map(win))
  const out: Record<string, MoveHint> = {}
  for (const line of lines) {
    const move = line.pv[0]
    if (!move || move.slice(0, 2) !== square) continue
    const loss = top - win(line)
    const hint: MoveHint = loss < 5 ? 'good' : loss < 15 ? 'dubious' : 'bad'
    const to = move.slice(2, 4)
    // A promotion square appears once per promoted piece: keep the best.
    if (!out[to] || hint === 'good' || (hint === 'dubious' && out[to] === 'bad')) out[to] = hint
  }
  return out
}
