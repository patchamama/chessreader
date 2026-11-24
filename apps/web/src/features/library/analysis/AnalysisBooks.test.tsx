import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen } from '@testing-library/react'
import AnalysisPage from './AnalysisPage'
import { openAnalysisBoard, useAnalysisBoards } from './analysisBoards'
import { openBookTab, useReaderTabs } from './readerTabs'

// S10: every open book is a closable tab of the Analysis board page; only the shown one has a reader.
const mounts: number[] = []
let live = 0
vi.mock('../components/BookReader', async () => {
  const React = await import('react')
  return {
    default: function FakeReader({ bookId }: { bookId: number }) {
      React.useEffect(() => {
        live++
        mounts.push(bookId)
        return () => { live-- }
      }, [bookId])
      return <div data-testid="reader">reader {bookId}</div>
    },
  }
})
vi.mock('../api/libraryApi', () => ({ useBookTitle: (id: number) => (id === 7 ? 'My System' : null) }))
vi.mock('../components/StudyBoard', () => ({ StudyBoard: () => <div data-testid="study-board" /> }))

beforeEach(() => {
  mounts.length = 0
  live = 0
  useAnalysisBoards.setState({ boards: [], active: null, scratch: null })
  useReaderTabs.setState({ books: [], externals: [], activeExternal: null, selected: { type: 'current' } })
})

describe('books as tabs of the Analysis board (S10)', () => {
  it('lists open books as tabs, shows one reader at a time, and closes them', () => {
    render(<AnalysisPage />)
    act(() => { openBookTab(7); openBookTab(9) })
    expect(screen.getByRole('tab', { name: 'My System' })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Book 9' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getAllByTestId('reader')).toHaveLength(1)
    expect(screen.getByTestId('reader')).toHaveTextContent('reader 9')

    fireEvent.click(screen.getByRole('tab', { name: 'My System' }))
    expect(screen.getByTestId('reader')).toHaveTextContent('reader 7')
    expect(live).toBe(1)

    fireEvent.click(screen.getByRole('tab', { name: 'Current board' }))
    expect(screen.queryByTestId('reader')).not.toBeInTheDocument()
    expect(live).toBe(0)

    fireEvent.click(screen.getByRole('tab', { name: 'Book 9' }))
    fireEvent.click(screen.getByRole('button', { name: 'Close Book 9' }))
    expect(screen.queryByRole('tab', { name: 'Book 9' })).not.toBeInTheDocument()
    expect(screen.queryByTestId('reader')).not.toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'My System' })).toBeInTheDocument()
  })

  it('a board opened while reading a book does not take the reader away', () => {
    render(<AnalysisPage />)
    act(() => { openBookTab(7) })
    act(() => { openAnalysisBoard({ title: 'Line' }) })
    expect(screen.getByTestId('reader')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('tab', { name: 'Line' }))
    expect(screen.queryByTestId('reader')).not.toBeInTheDocument()
  })
})

describe('books opened from outside are tabs of their own', () => {
  it('two openings show two tabs, one reader at a time, and the tab chosen gets its own book back', async () => {
    const { useExternalBookStore } = await import('../../../shared/externalBook/externalBookStore')
    const { openExternalTab } = await import('./readerTabs')
    useReaderTabs.setState({ books: [], externals: [], activeExternal: null, selected: { type: 'current' } })
    useExternalBookStore.setState({ title: '', chapters: [], source: null, version: 0 })
    render(<AnalysisPage />)
    act(() => {
      useExternalBookStore.getState().open('Study one', [])
      openExternalTab()
      useExternalBookStore.getState().open('Study two', [])
      openExternalTab()
    })
    expect(screen.getByRole('tab', { name: 'Study one' })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Study two' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getAllByTestId('reader')).toHaveLength(1)
    fireEvent.click(screen.getByRole('tab', { name: 'Study one' }))
    expect(screen.getByRole('tab', { name: 'Study one' })).toHaveAttribute('aria-selected', 'true')
    expect(useExternalBookStore.getState().title).toBe('Study one')
    fireEvent.click(screen.getByRole('button', { name: /Close.*Study one/i }))
    expect(screen.queryByRole('tab', { name: 'Study one' })).toBeNull()
  })
})
