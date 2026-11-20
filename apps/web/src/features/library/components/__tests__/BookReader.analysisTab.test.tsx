import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import ReadRoute from '../../../../app/ReadRoute'
import AnalysisPage from '../../analysis/AnalysisPage'
import { useStudyBoardStore } from '../../store/studyBoardStore'
import { useAnalysisBoards } from '../../analysis/analysisBoards'
import { useReaderTabs } from '../../analysis/readerTabs'

// finder-board-comments-round S10: /read/:bookId opens the whole reader inside a tab of the Analysis board page.

vi.mock('../../api/libraryApi', () => ({
  useChapter: (_id: number, n: number) => ({
    data: { title: `Chapter ${n}`, html: '<p>Intro.</p>\n<p>1. e4 e5 2. Nf3 Nc6</p>', toc: [{ order: 1, title: 'Chapter 1' }] },
    isLoading: false,
  }),
  useTouchBook: () => ({ mutate: vi.fn(), isPending: false }),
  useBookTitle: () => 'My System',
}))
vi.mock('react-chessboard', () => ({ Chessboard: () => <div data-testid="chessboard" /> }))
vi.mock('../../../../shared/stockfish/useStockfishEval', () => ({
  useStockfishEval: () => ({ loading: false, scoreCp: 0, depth: 10 }),
}))

beforeEach(() => {
  localStorage.clear()
  useStudyBoardStore.getState().reset()
  useAnalysisBoards.setState({ boards: [], active: null, scratch: null })
  useReaderTabs.setState({ books: [], selected: { type: 'current' } })
  Element.prototype.scrollIntoView = () => {}
})

describe('/read/:bookId lands on the Analysis board (S10)', () => {
  it('redirects to /analysis with the book tab selected and the full reader rendered', async () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    render(
      <QueryClientProvider client={qc}>
        <MemoryRouter initialEntries={['/read/7']}>
          <Routes>
            <Route path="/read/:bookId" element={<ReadRoute />} />
            <Route path="/analysis" element={<AnalysisPage />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    )
    await waitFor(() => expect(screen.getByTestId('book-reader')).toBeInTheDocument())
    expect(screen.getByRole('tab', { name: 'My System' })).toHaveAttribute('aria-selected', 'true')
    expect(useReaderTabs.getState().books).toEqual([{ bookId: 7 }])
    expect(screen.getAllByTestId('book-reader')).toHaveLength(1)
  })
})
