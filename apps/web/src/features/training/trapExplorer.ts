import type { Trap } from './traps'

/** The first moves of the traps (e4, d4, c4, Nf3…), the most common first. */
export function firstMoves(traps: Trap[]): string[] {
  const count = new Map<string, number>()
  for (const t of traps) if (t.sans[0]) count.set(t.sans[0], (count.get(t.sans[0]) ?? 0) + 1)
  return [...count.entries()].sort((a, b) => b[1] - a[1]).map(([m]) => m)
}

/** Moves that keep traps on the board, by position (kept here for existing imports). */
export { trapContinuations } from './traps'
