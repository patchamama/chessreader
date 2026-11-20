import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import React from 'react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import BookReader from '../BookReader'
import { useStudyBoardStore } from '../../store/studyBoardStore'
import { useAnalysisBoards, openAnalysisBoard } from '../../analysis/analysisBoards'

// finder-board-comments-round S2: a game opened in the reader gets a tab in the Analysis board page.

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

function wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return (
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={['/read/7']}>
        <Routes><Route path="/read/:bookId" element={children} /></Routes>
      </MemoryRouter>
    </QueryClientProvider>
  )
}

beforeEach(() => {
  localStorage.clear()
  useStudyBoardStore.getState().reset()
  useAnalysisBoards.setState({ boards: [], active: null, scratch: null })
  Element.prototype.scrollIntoView = () => {}
})

describe('opening a game registers an analysis tab (S2)', () => {
  it('adds one tab with the book as source and the game line, without changing the selected tab', async () => {
    const own = openAnalysisBoard({ title: 'Mine' })
    render(<BookReader />, { wrapper })
    await waitFor(() => expect(useAnalysisBoards.getState().boards.some((b) => b.key?.startsWith('book:7:1:'))).toBe(true))
    const s = useAnalysisBoards.getState()
    const tab = s.boards.find((b) => b.key === 'book:7:1:0')!
    expect(tab.source).toBe('My System')
    expect(tab.moves).toEqual(['e4', 'e5', 'Nf3', 'Nc6'])
    expect(s.active).toBe(own)
    expect(s.boards.filter((b) => b.key === 'book:7:1:0')).toHaveLength(1)
  })
})
