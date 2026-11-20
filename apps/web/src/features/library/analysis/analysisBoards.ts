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

/**
 * What the user did on a board of the analysis tab, kept while the app is open
 * (switching tabs or pages does not lose it): the game played or typed, the move
 * shown and the view.
 */
export interface AnalysisWork {
  /** The game: a position and the moves (UCI) played from it. */
  startFen: string
  moves: string[]
  /** Moves shown on the board (0 = the start position). */
  ply: number
  /** The game's text as typed, pasted or commented (empty for free play). */
  text: string
  flipped: boolean
  boardHidden: boolean
  /** How the text's comments are written: paragraphs (as books) or braces. */
  layout: 'paragraphs' | 'braces'
}

export interface AnalysisBoard extends AnalysisBoardInput {
  id: number
  work?: AnalysisWork
  /** Stable key of a board registered from an opened book or game (no duplicates). */
  key?: string
}

interface State {
  boards: AnalysisBoard[]
  active: number | null
  /** The free board of the "Current board" tab while no game of a book is open. */
  scratch: AnalysisWork | null
}

export const useAnalysisBoards = create<State>(() => ({ boards: [], active: null, scratch: null }))

let next = 1

export function openAnalysisBoard(input: AnalysisBoardInput): number {
  const id = next++
  useAnalysisBoards.setState((s) => ({ boards: [...s.boards, { ...input, id }], active: id }))
  return id
}

/** Most boards registered from opened books and games kept at once. */
export const MAX_REGISTERED_BOARDS = 20

/**
 * Add (or refresh) the board of a book or game that was opened, without
 * selecting it: the user finds it later in the Analysis board page. The same
 * key never makes a second tab; what the user did on the tab is kept. Over the
 * cap, the oldest registered tab without work (and not selected) is dropped.
 */
export function registerAnalysisBoard(input: AnalysisBoardInput, key: string): number {
  const existing = useAnalysisBoards.getState().boards.find((b) => b.key === key)
  if (existing) {
    if (!existing.work) useAnalysisBoards.setState((s) => ({ boards: s.boards.map((b) => (b.id === existing.id ? { ...b, ...input } : b)) }))
    return existing.id
  }
  const id = next++
  useAnalysisBoards.setState((s) => {
    let boards = [...s.boards, { ...input, id, key }]
    while (boards.filter((b) => b.key).length > MAX_REGISTERED_BOARDS) {
      const drop = boards.find((b) => b.key && !b.work && b.id !== s.active && b.id !== id)
      if (!drop) break
      boards = boards.filter((b) => b !== drop)
    }
    return { boards }
  })
  return id
}

export function closeAnalysisBoard(id: number): void {
  useAnalysisBoards.setState((s) => {
    const boards = s.boards.filter((b) => b.id !== id)
    return { boards, active: s.active === id ? boards[boards.length - 1]?.id ?? null : s.active }
  })
}

/** A new, empty analysis board (the "+" tab): the start position, to play or type a game. */
export function newAnalysisBoard(title: string): number {
  return openAnalysisBoard({ title })
}

/** Keep what the user did on a board (its game, the move shown, the view). */
export function updateAnalysisWork(id: number, work: AnalysisWork): void {
  useAnalysisBoards.setState((s) => ({ boards: s.boards.map((b) => (b.id === id ? { ...b, work } : b)) }))
}

/** Keep what the user did on the free board of the "Current board" tab. */
export function updateScratchWork(work: AnalysisWork | null): void {
  useAnalysisBoards.setState({ scratch: work })
}

/** Bring an open board to the front (its tab). */
export function activateAnalysisBoard(id: number): void {
  useAnalysisBoards.setState((s) => (s.boards.some((b) => b.id === id) ? { active: id } : s))
}
