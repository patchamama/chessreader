import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { actionsOfMatching } from './commentActions'

/**
 * Narration guides (compact actions) of the paragraphs of a book that have no comment in the
 * database: kept in this browser, keyed by book + chapter + the hash of the paragraph (ai-narration-guides S2).
 */
export interface StoredGuide {
  /** The paragraph as analysed. */
  text: string
  /** The position the paragraph talks about. */
  fen: string
  /** The compact actions ("2Diagonal:c8-h3, 13Arrow:f7-f5"). */
  actions: string
}

/** A text compared whatever its spacing and case. */
export const normGuideText = (s: string) => s.replace(/\s+/g, ' ').trim()

/** FNV-1a of a text (hex): short, stable keys. */
export function textHash(text: string): string {
  let h = 0x811c9dc5
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return (h >>> 0).toString(16)
}

export const guideKey = (bookId: number | string, chapter: number, text: string) => `${bookId}|${chapter}|${textHash(normGuideText(text))}`

interface GuideState {
  guides: Record<string, StoredGuide>
  set: (key: string, guide: StoredGuide) => void
  remove: (key: string) => void
  clear: () => void
}

export const useGuideStore = create<GuideState>()(
  persist(
    (set) => ({
      guides: {},
      set: (key, guide) => set((s) => ({ guides: { ...s.guides, [key]: guide } })),
      remove: (key) => set((s) => ({ guides: Object.fromEntries(Object.entries(s.guides).filter(([k]) => k !== key)) })),
      clear: () => set({ guides: {} }),
    }),
    { name: 'chessreader-narration-guides', version: 1 },
  ),
)

const placement = (fen: string) => fen.split(' ').slice(0, 4).join(' ')

/** The actions kept here for the text narrated on that position (the narrator's second source, after the database). */
export function localActionsFor(text: string, fen: string): string | undefined {
  const here = placement(fen)
  const candidates = Object.values(useGuideStore.getState().guides).filter((g) => placement(g.fen) === here)
  return actionsOfMatching(candidates, text)
}
