import { trapsAt, type Trap } from './traps'

/** The first moves of the traps (e4, d4, c4, Nf3…), the most common first. */
export function firstMoves(traps: Trap[]): string[] {
  const count = new Map<string, number>()
  for (const t of traps) if (t.sans[0]) count.set(t.sans[0], (count.get(t.sans[0]) ?? 0) + 1)
  return [...count.entries()].sort((a, b) => b[1] - a[1]).map(([m]) => m)
}

/**
 * From a position on the line of some traps: each next move that keeps traps
 * reachable, with those traps, the move with most traps first.
 */
export function trapContinuations(fen: string, traps: Trap[]): { san: string; traps: Trap[] }[] {
  const by = new Map<string, Trap[]>()
  for (const { trap, ply } of trapsAt(fen, traps)) {
    const san = trap.sans[ply]
    by.set(san, [...(by.get(san) ?? []), trap])
  }
  return [...by.entries()].map(([san, t]) => ({ san, traps: t })).sort((a, b) => b.traps.length - a.traps.length)
}
