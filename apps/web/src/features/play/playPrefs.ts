import { create } from 'zustand'
import { persist } from 'zustand/middleware'

/** Whose positions get the book comments: after both sides' moves, only mine, or only the opponent's. */
export type LiveCommentSide = 'off' | 'both' | 'mine' | 'opponent'

/** Where the evaluation bar goes around the board: beside it (vertical) or above / below it (horizontal). */
export type EvalBarPosition = 'left' | 'right' | 'top' | 'bottom'

/** Bounds of the tutor panel's height, in pixels. */
export const TUTOR_HEIGHT = { min: 120, max: 1200, initial: 360, step: 40 }

interface PlayPrefs {
  /** Live human comments from the comments database (S14.2). */
  liveComments: LiveCommentSide
  /** The database comments of each position, editable, listed under the board. */
  positionComments: boolean
  /** The moves the books' games played from the position (S14.1, heavy: off by default). */
  gmMoves: boolean
  /** Touching a piece makes the tutor explain what moving it implies (S14.8). */
  explainTouch: boolean
  /** Where the evaluation bar is drawn (S12). */
  evalBarPosition: EvalBarPosition
  /** Height of the tutor panel, resized by hand (S13). */
  tutorHeight: number
  /** The configuration block (opponent, colour, options) folded away (S13). */
  configCollapsed: boolean
  set: (p: Partial<Omit<PlayPrefs, 'set' | 'reset'>>) => void
  reset: () => void
}

const DEFAULTS = {
  liveComments: 'both' as LiveCommentSide,
  gmMoves: false,
  positionComments: false,
  explainTouch: true,
  evalBarPosition: 'left' as EvalBarPosition,
  tutorHeight: TUTOR_HEIGHT.initial,
  configCollapsed: false,
}

/** Clamps a tutor height to its bounds. */
export const clampTutorHeight = (h: number) => Math.round(Math.min(TUTOR_HEIGHT.max, Math.max(TUTOR_HEIGHT.min, h)))

/** Options of the play page's study tools, kept in this browser. */
export const usePlayPrefs = create<PlayPrefs>()(persist((set) => ({
  ...DEFAULTS,
  set: (p) => set(p),
  reset: () => set(DEFAULTS),
}), {
  name: 'play-prefs',
  partialize: ({ liveComments, positionComments, gmMoves, explainTouch, evalBarPosition, tutorHeight, configCollapsed }) =>
    ({ liveComments, positionComments, gmMoves, explainTouch, evalBarPosition, tutorHeight, configCollapsed }),
}))
