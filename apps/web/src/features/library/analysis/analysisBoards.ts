import { create } from 'zustand'

/**
 * Extra analysis boards: a variation, an engine line or a book comment opened
 * from the text without replacing the study board. Several can be open; each
 * can be closed. The UI (panel, replay, narration) reads this store.
 */
export interface AnalysisBoardInput {
  title: string
  /** A line from a position… */
  startFen?: string
  moves?: string[]
  /** …or a whole game (e.g. a book's commented game). */
  pgn?: string
  /** Ply to show first (0 = start). */
  ply?: number
  /** Text to read and narrate (a comment), with its moves highlighted on the board. */
  text?: string
  /** Where it comes from, shown under the title ("Kasparov, Mis geniales predecesores III"). */
  source?: string
}

export interface AnalysisBoard extends AnalysisBoardInput { id: number }

interface State { boards: AnalysisBoard[]; active: number | null }

export const useAnalysisBoards = create<State>(() => ({ boards: [], active: null }))

let next = 1

export function openAnalysisBoard(input: AnalysisBoardInput): number {
  const id = next++
  useAnalysisBoards.setState((s) => ({ boards: [...s.boards, { ...input, id }], active: id }))
  return id
}

export function closeAnalysisBoard(id: number): void {
  useAnalysisBoards.setState((s) => {
    const boards = s.boards.filter((b) => b.id !== id)
    return { boards, active: s.active === id ? boards[boards.length - 1]?.id ?? null : s.active }
  })
}

/** Bring an open board to the front (its tab). */
export function activateAnalysisBoard(id: number): void {
  useAnalysisBoards.setState((s) => (s.boards.some((b) => b.id === id) ? { active: id } : s))
}
