import { describe, it, expect, beforeEach } from 'vitest'
import { useReaderViewStore, READER_WIDTH_MIN, READER_WIDTH_MAX } from '../readerViewStore'

beforeEach(() => {
  localStorage.clear()
  useReaderViewStore.setState({ bookComments: true, textWidth: null, commentPick: 0 })
})

describe('readerViewStore (S4, S9)', () => {
  it('shows the book comments by default and re-picks them each time they are shown again', () => {
    expect(useReaderViewStore.getState().bookComments).toBe(true)
    useReaderViewStore.getState().toggleBookComments()
    expect(useReaderViewStore.getState()).toMatchObject({ bookComments: false, commentPick: 0 })
    useReaderViewStore.getState().toggleBookComments()
    expect(useReaderViewStore.getState()).toMatchObject({ bookComments: true, commentPick: 1 })
    expect(JSON.parse(localStorage.getItem('chessreader-reader-view-v1')!)).toMatchObject({ bookComments: true })
  })

  it('remembers the text width on this device, within its bounds', () => {
    useReaderViewStore.getState().setTextWidth(5000)
    expect(useReaderViewStore.getState().textWidth).toBe(READER_WIDTH_MAX)
    useReaderViewStore.getState().setTextWidth(10)
    expect(useReaderViewStore.getState().textWidth).toBe(READER_WIDTH_MIN)
    useReaderViewStore.getState().setTextWidth(null)
    expect(JSON.parse(localStorage.getItem('chessreader-reader-view-v1')!).textWidth).toBeNull()
  })
})
