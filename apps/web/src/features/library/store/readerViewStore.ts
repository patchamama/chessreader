import { create } from 'zustand'

/**
 * How the reader shows a book on this device: whether the book comments
 * inserted in the text are shown (S4) and the width of the text column (S9).
 */
const KEY = 'chessreader-reader-view-v1'

export const READER_WIDTH_MIN = 480
export const READER_WIDTH_MAX = 1100

interface Stored {
  bookComments: boolean
  /** Maximum width of the text column in px; null: the whole pane. */
  textWidth: number | null
}

function read(): Stored {
  const fallback: Stored = { bookComments: true, textWidth: null }
  try {
    const s = JSON.parse(localStorage.getItem(KEY) ?? '{}') as Partial<Stored>
    return {
      bookComments: typeof s.bookComments === 'boolean' ? s.bookComments : fallback.bookComments,
      textWidth: typeof s.textWidth === 'number' ? clampWidth(s.textWidth) : null,
    }
  } catch {
    return fallback
  }
}

function write(s: Stored): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(s))
  } catch {
    /* not kept: storage full or blocked */
  }
}

const clampWidth = (w: number) => Math.min(READER_WIDTH_MAX, Math.max(READER_WIDTH_MIN, Math.round(w)))

interface ReaderViewState extends Stored {
  /** Bumped each time the book comments are shown again: one remark per position is picked anew. */
  commentPick: number
  toggleBookComments: () => void
  setTextWidth: (width: number | null) => void
}

export const useReaderViewStore = create<ReaderViewState>((set, get) => ({
  ...read(),
  commentPick: 0,
  toggleBookComments: () => {
    const bookComments = !get().bookComments
    write({ bookComments, textWidth: get().textWidth })
    set((s) => ({ bookComments, commentPick: bookComments ? s.commentPick + 1 : s.commentPick }))
  },
  setTextWidth: (width) => {
    const textWidth = width === null ? null : clampWidth(width)
    write({ bookComments: get().bookComments, textWidth })
    set({ textWidth })
  },
}))
