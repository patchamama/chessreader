import { create } from 'zustand'
import type { GameTree } from '@chess-ebook/chess-shared'
import type { MoveHint } from '../review/reviewEngine'

/**
 * Moves coloured by their evaluation (reader-analysis-round S11): the rating of
 * every main-line move of a game (good / dubious / bad, the scale of the board's
 * move hints), computed with the engine and kept per book, chapter and game, in
 * memory and in the browser, so the colouring is there when reading any
 * chapter evaluated before.
 */

/** One game rated: the moves it was rated on (signature) and one letter per main-line move. */
export interface RatedGame {
  sig: string
  /** g = good, d = dubious, b = bad, - = not rated. */
  hints: string
}

const STORAGE_KEY = 'reader-eval-coloring.v1'
const LETTER: Record<MoveHint, string> = { good: 'g', dubious: 'd', bad: 'b' }
const HINT: Record<string, MoveHint> = { g: 'good', d: 'dubious', b: 'bad' }

export const coloringKey = (book: number, chapter: number, gameIndex: number) => `${book}:${chapter}:${gameIndex}`

/** The moves of a game's main line, as a short hash: ratings of other moves are never applied. */
export function gameSignature(tree: GameTree): string {
  const sans = tree.mainline.map((id) => tree.nodes.get(id)?.san ?? '?').join(' ')
  let h = 5381
  for (let i = 0; i < sans.length; i++) h = ((h * 33) ^ sans.charCodeAt(i)) >>> 0
  return `${tree.mainline.length}-${h.toString(36)}`
}

/** The rating of each main-line move of a game (node id → hint), or null when it was not rated on these moves. */
export function qualitiesOf(
  entries: Record<string, RatedGame>,
  book: number,
  chapter: number,
  gameIndex: number,
  tree: GameTree,
): Record<string, MoveHint> | null {
  const entry = entries[coloringKey(book, chapter, gameIndex)]
  if (!entry || entry.sig !== gameSignature(tree)) return null
  const out: Record<string, MoveHint> = {}
  tree.mainline.forEach((id, i) => {
    const hint = HINT[entry.hints[i]]
    if (hint) out[id] = hint
  })
  return out
}

interface EvalColoringState {
  /** Colour the moves of the text by their evaluation. */
  enabled: boolean
  entries: Record<string, RatedGame>
  setEnabled: (enabled: boolean) => void
  /** Keep the ratings of a game (one per main-line move, null = not rated). */
  save: (book: number, chapter: number, gameIndex: number, tree: GameTree, hints: Array<MoveHint | null>) => void
  /** Read the ratings kept in the browser. */
  load: () => void
  reset: () => void
}

function persist(state: Pick<EvalColoringState, 'enabled' | 'entries'>) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ enabled: state.enabled, entries: state.entries }))
  } catch { /* storage full or blocked: the ratings stay in memory */ }
}

function stored(): Pick<EvalColoringState, 'enabled' | 'entries'> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    const parsed = raw ? (JSON.parse(raw) as Partial<EvalColoringState>) : null
    if (parsed && typeof parsed === 'object') {
      return { enabled: parsed.enabled === true, entries: parsed.entries && typeof parsed.entries === 'object' ? parsed.entries : {} }
    }
  } catch { /* unreadable: start empty */ }
  return { enabled: false, entries: {} }
}

export const useEvalColoringStore = create<EvalColoringState>((set, get) => ({
  ...stored(),
  setEnabled: (enabled) => { set({ enabled }); persist(get()) },
  save: (book, chapter, gameIndex, tree, hints) => {
    const entry: RatedGame = { sig: gameSignature(tree), hints: hints.map((h) => (h ? LETTER[h] : '-')).join('') }
    set((s) => ({ entries: { ...s.entries, [coloringKey(book, chapter, gameIndex)]: entry } }))
    persist(get())
  },
  load: () => set(stored()),
  reset: () => {
    set({ enabled: false, entries: {} })
    try { localStorage.removeItem(STORAGE_KEY) } catch { /* nothing kept */ }
  },
}))
