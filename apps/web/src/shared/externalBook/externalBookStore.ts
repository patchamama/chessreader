import { create } from 'zustand'

/** Id of the in-memory book that holds games opened from an outside source. */
export const EXTERNAL_BOOK_ID = -1

export interface ExternalChapter {
  title: string
  html: string
  toc: { order: number; title: string }[]
}

interface ExternalBookState {
  title: string
  chapters: ExternalChapter[]
  /** Bumped on every open so cached chapter queries are refetched. */
  version: number
  open: (title: string, chapters: ExternalChapter[]) => void
}

/**
 * A book that lives only in memory: games fetched from Lichess or chess.com
 * are opened in the regular reader through it, without touching the library.
 */
export const useExternalBookStore = create<ExternalBookState>((set) => ({
  title: '',
  chapters: [],
  version: 0,
  open: (title, chapters) => set((s) => ({ title, chapters, version: s.version + 1 })),
}))
