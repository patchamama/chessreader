import { create } from 'zustand'
import { EXTERNAL_BOOK_ID, useExternalBookStore, type ExternalChapter, type ExternalSource } from '../../../shared/externalBook/externalBookStore'

/** What the Analysis board page shows: the live "Current board", an analysis board, an open book, or a book opened from outside. */
export type SelectedTab =
  | { type: 'current' }
  | { type: 'board'; id: number }
  | { type: 'book'; bookId: number }
  | { type: 'external'; tabId: number }

/** A game or study opened from outside (Lichess, the database, the game search): its own tab, with its book kept. */
export interface ExternalTab {
  tabId: number
  /** The version of the external book when the tab was made (one per opening). */
  version: number
  snapshot: { title: string; chapters: ExternalChapter[]; source: ExternalSource | null }
}

interface State {
  /** Open books, in the order they were opened (one closable tab each). */
  books: { bookId: number }[]
  /** Books opened from outside, one tab each opening. */
  externals: ExternalTab[]
  /** The external tab whose book is loaded in the reader's external book right now. */
  activeExternal: number | null
  selected: SelectedTab
}

export const useReaderTabs = create<State>(() => ({ books: [], externals: [], activeExternal: null, selected: { type: 'current' } }))

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

let nextExternal = 1

/**
 * The book just opened from outside gets a tab of its own (the same opening
 * again only brings its tab to the front): opening a second game or study never
 * replaces the first one in the same board.
 */
export function openExternalTab(): number {
  const { title, chapters, source, version } = useExternalBookStore.getState()
  const known = useReaderTabs.getState().externals.find((t) => t.version === version)
  if (known) {
    useReaderTabs.setState({ selected: { type: 'external', tabId: known.tabId }, activeExternal: known.tabId })
    return known.tabId
  }
  const tabId = nextExternal++
  useReaderTabs.setState((s) => ({
    externals: [...s.externals, { tabId, version, snapshot: { title, chapters, source } }],
    activeExternal: tabId,
    selected: { type: 'external', tabId },
  }))
  return tabId
}

/** Show an external tab: its book is put back in the reader's external book when another one was loaded. */
export function selectExternalTab(tabId: number): void {
  const tab = useReaderTabs.getState().externals.find((t) => t.tabId === tabId)
  if (!tab) return
  if (useReaderTabs.getState().activeExternal !== tabId) {
    useExternalBookStore.getState().open(tab.snapshot.title, tab.snapshot.chapters, tab.snapshot.source)
    // The restore is a new opening of the same book: the tab follows it, so it is not opened twice.
    const version = useExternalBookStore.getState().version
    useReaderTabs.setState((s) => ({ externals: s.externals.map((t) => (t.tabId === tabId ? { ...t, version } : t)) }))
  }
  useReaderTabs.setState({ activeExternal: tabId, selected: { type: 'external', tabId } })
}

/** Close an external tab; if it was the one shown, the Current board comes back. */
export function closeExternalTab(tabId: number): void {
  useReaderTabs.setState((s) => ({
    externals: s.externals.filter((t) => t.tabId !== tabId),
    activeExternal: s.activeExternal === tabId ? null : s.activeExternal,
    selected: s.selected.type === 'external' && s.selected.tabId === tabId ? { type: 'current' } : s.selected,
  }))
}

export function selectTab(selected: SelectedTab): void {
  if (selected.type === 'external') selectExternalTab(selected.tabId)
  else useReaderTabs.setState({ selected })
}

/** The open book being shown, if any (an external tab reads the reader's external book). */
export const selectedBookId = (s: State): number | null =>
  s.selected.type === 'book' ? s.selected.bookId : s.selected.type === 'external' ? EXTERNAL_BOOK_ID : null
