import { beforeEach, describe, expect, it } from 'vitest'
import { closeBookTab, closeExternalTab, openBookTab, openExternalTab, selectedBookId, selectExternalTab, selectTab, useReaderTabs } from './readerTabs'
import { EXTERNAL_BOOK_ID, useExternalBookStore } from '../../../shared/externalBook/externalBookStore'

beforeEach(() => useReaderTabs.setState({ books: [], externals: [], activeExternal: null, selected: { type: 'current' } }))

describe('reader tabs (S10)', () => {
  it('opening a book adds its tab once and selects it', () => {
    openBookTab(7)
    openBookTab(9)
    openBookTab(7)
    const s = useReaderTabs.getState()
    expect(s.books.map((b) => b.bookId)).toEqual([7, 9])
    expect(s.selected).toEqual({ type: 'book', bookId: 7 })
    expect(selectedBookId(s)).toBe(7)
  })

  it('closing the shown book goes back to the current board; closing another keeps the selection', () => {
    openBookTab(7)
    openBookTab(9)
    closeBookTab(7)
    expect(useReaderTabs.getState().selected).toEqual({ type: 'book', bookId: 9 })
    closeBookTab(9)
    const s = useReaderTabs.getState()
    expect(s.books).toEqual([])
    expect(s.selected).toEqual({ type: 'current' })
    expect(selectedBookId(s)).toBeNull()
  })

  it('selectTab picks a board without closing books', () => {
    openBookTab(7)
    selectTab({ type: 'board', id: 3 })
    expect(useReaderTabs.getState().books).toHaveLength(1)
    expect(selectedBookId(useReaderTabs.getState())).toBeNull()
  })
})

describe('external books: every game or study opened is a tab of its own', () => {
  const reset = () => {
    useReaderTabs.setState({ books: [], externals: [], activeExternal: null, selected: { type: 'current' } })
    useExternalBookStore.setState({ title: '', chapters: [], source: null, version: 0 })
  }
  beforeEach(reset)
  const chapter = (title: string) => ({ title, html: `<p>${title}</p>`, toc: [{ order: 1, title }] })

  it('a second book opened from outside adds a second tab instead of replacing the first', () => {
    useExternalBookStore.getState().open('Study one', [chapter('One')])
    openExternalTab()
    useExternalBookStore.getState().open('Study two', [chapter('Two')])
    openExternalTab()
    const s = useReaderTabs.getState()
    expect(s.externals.map((t) => t.snapshot.title)).toEqual(['Study one', 'Study two'])
    expect(s.selected).toEqual({ type: 'external', tabId: s.externals[1].tabId })
    expect(selectedBookId(s)).toBe(EXTERNAL_BOOK_ID)
  })

  it('opening the same book again (the same version) brings its tab to the front, no duplicate', () => {
    useExternalBookStore.getState().open('Study one', [chapter('One')])
    openExternalTab()
    openExternalTab()
    expect(useReaderTabs.getState().externals).toHaveLength(1)
  })

  it('selecting an earlier tab puts its book back in the reader\'s external book', () => {
    useExternalBookStore.getState().open('Study one', [chapter('One')])
    openExternalTab()
    useExternalBookStore.getState().open('Study two', [chapter('Two')])
    openExternalTab()
    const first = useReaderTabs.getState().externals[0].tabId
    selectExternalTab(first)
    expect(useExternalBookStore.getState().title).toBe('Study one')
    expect(useExternalBookStore.getState().chapters[0].title).toBe('One')
    expect(useReaderTabs.getState().selected).toEqual({ type: 'external', tabId: first })
  })

  it('closing the shown one goes back to the current board; the others stay', () => {
    useExternalBookStore.getState().open('Study one', [chapter('One')])
    openExternalTab()
    useExternalBookStore.getState().open('Study two', [chapter('Two')])
    openExternalTab()
    const [a, b] = useReaderTabs.getState().externals.map((t) => t.tabId)
    closeExternalTab(b)
    expect(useReaderTabs.getState().externals.map((t) => t.tabId)).toEqual([a])
    expect(useReaderTabs.getState().selected).toEqual({ type: 'current' })
  })
})
