import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'

/** Id of the in-memory book that holds games opened from an outside source. */
export const EXTERNAL_BOOK_ID = -1

export interface ExternalChapter {
  title: string
  html: string
  toc: { order: number; title: string }[]
}

/** Where a book came from, when it can be read again (a resources repo book by its id). */
export interface ExternalSource {
  kind: 'repo'
  id: string
}

interface ExternalBookState {
  title: string
  chapters: ExternalChapter[]
  /** Set for a book that is kept by its source instead of its chapters. */
  source: ExternalSource | null
  /** Bumped on every open so cached chapter queries are refetched. */
  version: number
  open: (title: string, chapters: ExternalChapter[], source?: ExternalSource | null) => void
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
      source: null,
      version: 0,
      open: (title, chapters, source = null) => set((s) => ({ title, chapters, source, version: s.version + 1 })),
    }),
    // Kept in the browser: a refresh does not lose a pasted or annotated book.
    // A book with a source is kept by it: its images are object URLs that die
    // with the page, and a whole EPUB would not fit in the storage anyway.
    {
      name: 'chessreader-external-book',
      storage: safeStorage,
      partialize: (s) => ({ title: s.title, source: s.source, chapters: s.source ? [] : s.chapters }),
    },
  ),
)

type SourceLoader = (source: ExternalSource, title: string) => Promise<ExternalChapter[]>
const loaders = new Map<ExternalSource['kind'], SourceLoader>()
let pending: Promise<ExternalChapter[]> | null = null

/** How a book kept by its source is read again (registered by the feature that opens it). */
export function registerExternalSourceLoader(kind: ExternalSource['kind'], loader: SourceLoader): void {
  loaders.set(kind, loader)
}

/** The external book's chapters, reading a book kept by its source again after a refresh. */
export async function ensureExternalChapters(): Promise<ExternalChapter[]> {
  const { chapters, source, title } = useExternalBookStore.getState()
  if (chapters.length > 0 || !source) return chapters
  const loader = loaders.get(source.kind)
  if (!loader) return chapters
  pending ??= loader(source, title)
    .then((loaded) => {
      if (useExternalBookStore.getState().source === source) useExternalBookStore.setState({ chapters: loaded })
      return loaded
    })
    .finally(() => { pending = null })
  return pending
}
