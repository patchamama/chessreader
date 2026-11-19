/**
 * How long each player has been thinking in total, in any game (with or
 * without a clock): the time since the last move goes to the side that moved.
 */
export interface ThinkTimes {
  white: number
  black: number
  /** Whose time is running; null once the game is over. */
  turn: 'white' | 'black' | null
  /** When the running side started thinking (ms since epoch). */
  since: number
}

export const startThinking = (turn: 'white' | 'black', now: number): ThinkTimes => ({ white: 0, black: 0, turn, since: now })

/** A move was made: charge the mover and start the other side's time (unless the game ended). */
export function switchThinking(t: ThinkTimes, now: number, over = false): ThinkTimes {
  if (!t.turn) return t
  const spent = Math.max(0, now - t.since)
  const next = { ...t, [t.turn]: t[t.turn] + spent, since: now }
  return { ...next, turn: over ? null : t.turn === 'white' ? 'black' : 'white' }
}

/** Both totals right now, counting the running side's current think. */
export function thinkingNow(t: ThinkTimes, now: number): { white: number; black: number } {
  const running = t.turn ? Math.max(0, now - t.since) : 0
  return { white: t.white + (t.turn === 'white' ? running : 0), black: t.black + (t.turn === 'black' ? running : 0) }
}
