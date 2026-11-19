import { create } from 'zustand'
import { persist } from 'zustand/middleware'

/** Whose positions get the book comments: after both sides' moves, only mine, or only the opponent's. */
export type LiveCommentSide = 'off' | 'both' | 'mine' | 'opponent'

interface PlayPrefs {
  /** Live human comments from the comments database (S14.2). */
  liveComments: LiveCommentSide
  /** The moves the books' games played from the position (S14.1, heavy: off by default). */
  gmMoves: boolean
  /** Touching a piece makes the tutor explain what moving it implies (S14.8). */
  explainTouch: boolean
  set: (p: Partial<Omit<PlayPrefs, 'set' | 'reset'>>) => void
  reset: () => void
}

const DEFAULTS = { liveComments: 'both' as LiveCommentSide, gmMoves: false, explainTouch: true }

/** Options of the play page's study tools, kept in this browser. */
export const usePlayPrefs = create<PlayPrefs>()(persist((set) => ({
  ...DEFAULTS,
  set: (p) => set(p),
  reset: () => set(DEFAULTS),
}), { name: 'play-prefs', partialize: ({ liveComments, gmMoves, explainTouch }) => ({ liveComments, gmMoves, explainTouch }) }))
