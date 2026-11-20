import { create } from 'zustand'

/** What the Analysis board page shows: the live "Current board", an analysis board, or a whole open book. */
export type SelectedTab = { type: 'current' } | { type: 'board'; id: number } | { type: 'book'; bookId: number }

interface State {
  /** Open books, in the order they were opened (one closable tab each). */
  books: { bookId: number }[]
  selected: SelectedTab
}

export const useReaderTabs = create<State>(() => ({ books: [], selected: { type: 'current' } }))

/** Open (or bring to the front) the tab of a book: the full reader is shown inside the Analysis board page. */
export function openBookTab(bookId: number): void {
  useReaderTabs.setState((s) => ({
    books: s.books.some((b) => b.bookId === bookId) ? s.books : [...s.books, { bookId }],
    selected: { type: 'book', bookId },
  }))
}

/** Close a book's tab; if it was the one shown, the Current board comes back. */
export function closeBookTab(bookId: number): void {
  useReaderTabs.setState((s) => ({
    books: s.books.filter((b) => b.bookId !== bookId),
    selected: s.selected.type === 'book' && s.selected.bookId === bookId ? { type: 'current' } : s.selected,
  }))
}

export function selectTab(selected: SelectedTab): void {
  useReaderTabs.setState({ selected })
}

/** The open book being shown, if any. */
export const selectedBookId = (s: State): number | null => (s.selected.type === 'book' ? s.selected.bookId : null)
