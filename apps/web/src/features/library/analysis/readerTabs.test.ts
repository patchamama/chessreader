import { beforeEach, describe, expect, it } from 'vitest'
import { closeBookTab, openBookTab, selectedBookId, selectTab, useReaderTabs } from './readerTabs'

beforeEach(() => useReaderTabs.setState({ books: [], selected: { type: 'current' } }))

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
