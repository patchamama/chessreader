import { create } from 'zustand'
import type { ErrataEntry } from './errataFormat'

/**
 * The book and chapter open in the reader, as the errata need them (the
 * correction workbench saves an entry for this book and chapter), and the
 * errata already applied to the chapter's text. Set by useChapter.
 */
interface ErrataContextState {
  bookId: number | null
  bookTitle: string | null
  chapter: number | null
  applied: ErrataEntry[]
  set: (ctx: { bookId: number; bookTitle: string | null; chapter: number; applied: ErrataEntry[] }) => void
}

export const useErrataContext = create<ErrataContextState>((set) => ({
  bookId: null,
  bookTitle: null,
  chapter: null,
  applied: [],
  set: (ctx) => set(ctx),
}))
