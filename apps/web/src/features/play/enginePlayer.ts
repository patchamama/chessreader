import type { EngineLine } from '../../shared/stockfish/useEngineLines'
import type { AnalysePosition } from '../library/review/reviewEngine'

/**
 * The engine as an opponent of a chosen strength (1 weakest – 8 full): a weak
 * level searches shallow and picks at random among several lines within a
 * margin of the best one, so it plays plausible but imperfect moves.
 */
const DEPTH = [1, 2, 4, 6, 8, 10, 12, 16]
const LINES = [4, 4, 3, 3, 2, 2, 2, 1]
/** How many centipawns below the best line a level still accepts. */
const MARGIN = [400, 250, 150, 100, 70, 50, 25, 0]

export function strengthSettings(level: number): { depth: number; lines: number } {
  const i = Math.max(1, Math.min(8, Math.round(level))) - 1
  return { depth: DEPTH[i], lines: LINES[i] }
}

const value = (l: EngineLine) => (l.mate !== undefined ? (l.mate > 0 ? 100000 - l.mate : -100000 - l.mate) : l.scoreCp ?? 0)

/** The UCI move the engine plays at this level, from its candidate lines (best first). */
export function pickEngineMove(lines: EngineLine[], level: number, rand: () => number = Math.random): string | null {
  const ok = lines.filter((l) => l.pv?.length)
  if (!ok.length) return null
  const i = Math.max(1, Math.min(8, Math.round(level))) - 1
  const best = value(ok[0])
  const allowed = ok.slice(0, LINES[i]).filter((l) => best - value(l) <= MARGIN[i])
  return allowed[Math.min(allowed.length - 1, Math.floor(rand() * allowed.length))].pv[0]
}

export async function engineMove(analyse: AnalysePosition, fen: string, level: number): Promise<string | null> {
  const { depth, lines } = strengthSettings(level)
  return pickEngineMove(await analyse(fen, depth, lines), level)
}
