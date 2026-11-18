import { create } from 'zustand'

/**
 * Which study tool takes the study board's place (study-tools-round S7): the
 * position trainer (lines saved for spaced repetition). "Guess the move" is
 * the practice store's own `active` flag.
 */
interface StudyToolsState {
  trainerOpen: boolean
  setTrainerOpen: (open: boolean) => void
}

export const useStudyToolsStore = create<StudyToolsState>((set) => ({
  trainerOpen: false,
  setTrainerOpen: (trainerOpen) => set({ trainerOpen }),
}))
