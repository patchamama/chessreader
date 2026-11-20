import type { AnalysePosition } from '../library/review/reviewEngine'

/** How deep the engine looks at each ranked position: modest, there can be 50 of them. */
export const RANKING_EVAL_DEPTH = 12

export interface PositionEval { /** Centipawns from White's point of view. */ cp?: number; /** Moves to mate, positive when White mates. */ mate?: number; depth: number }

/** "+0.35", "-1.20", "M5", "-M3": always from White's point of view. */
export function formatEval(e: Pick<PositionEval, 'cp' | 'mate'>): string {
  if (e.mate !== undefined) return e.mate < 0 ? `-M${-e.mate}` : `M${e.mate}`
  const cp = e.cp ?? 0
  return `${cp > 0 ? '+' : ''}${(cp / 100).toFixed(2)}`
}

const KEY = 'ranking-eval:v1:'
const read = (fen: string): PositionEval | null => {
  try {
    const raw = localStorage.getItem(KEY + fen)
    return raw ? (JSON.parse(raw) as PositionEval) : null
  } catch { return null }
}
const write = (fen: string, e: PositionEval) => { try { localStorage.setItem(KEY + fen, JSON.stringify(e)) } catch { /* storage unavailable */ } }

/** Evaluations by FEN, kept in memory and in localStorage; the engine is asked once per position. */
export function createEvaluator(analyse: AnalysePosition, depth = RANKING_EVAL_DEPTH) {
  const memory = new Map<string, PositionEval>()
  const cached = (fen: string): PositionEval | null => {
    const m = memory.get(fen) ?? read(fen)
    if (m) memory.set(fen, m)
    return m
  }
  const evaluate = async (fen: string): Promise<PositionEval | null> => {
    const hit = cached(fen)
    if (hit) return hit
    try {
      const [top] = await analyse(fen, depth, 1)
      if (!top || (top.scoreCp === undefined && top.mate === undefined)) return null
      const sign = fen.split(' ')[1] === 'b' ? -1 : 1
      const result: PositionEval = top.mate !== undefined ? { mate: sign * top.mate, depth: top.depth } : { cp: sign * (top.scoreCp ?? 0) || 0, depth: top.depth }
      memory.set(fen, result)
      write(fen, result)
      return result
    } catch {
      return null
    }
  }
  return { evaluate, cached }
}

/** Evaluates the positions one at a time, in order; `onResult` hears each (null: n/a) with how many are done. */
export async function evaluateAll(
  fens: string[],
  evaluator: ReturnType<typeof createEvaluator>,
  opts: { onResult: (fen: string, e: PositionEval | null, done: number, total: number) => void; signal?: AbortSignal },
): Promise<void> {
  for (let i = 0; i < fens.length; i++) {
    if (opts.signal?.aborted) return
    const e = await evaluator.evaluate(fens[i])
    if (opts.signal?.aborted) return
    opts.onResult(fens[i], e, i + 1, fens.length)
  }
}
