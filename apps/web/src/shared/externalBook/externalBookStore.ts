import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'

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
 * A book that lives in this browser: games fetched from Lichess or chess.com
 * are opened in the regular reader through it, without touching the library.
 */
/** localStorage, quietly: a full or blocked storage only means the book is not kept. */
const safeStorage = createJSONStorage(() => ({
  getItem: (k: string) => { try { return localStorage.getItem(k) } catch { return null } },
  setItem: (k: string, v: string) => { try { localStorage.setItem(k, v) } catch { /* not kept */ } },
  removeItem: (k: string) => { try { localStorage.removeItem(k) } catch { /* nothing */ } },
}))

export const useExternalBookStore = create<ExternalBookState>()(
  persist(
    (set) => ({
      title: '',
      chapters: [],
      version: 0,
      open: (title, chapters) => set((s) => ({ title, chapters, version: s.version + 1 })),
    }),
    // Kept in the browser: a refresh does not lose a pasted or annotated book.
    { name: 'chessreader-external-book', storage: safeStorage, partialize: (s) => ({ title: s.title, chapters: s.chapters }) },
  ),
)
