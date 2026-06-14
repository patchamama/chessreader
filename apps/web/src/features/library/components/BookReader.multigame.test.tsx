import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, waitFor, fireEvent, act } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import React from 'react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import BookReader from './BookReader'
import { useStudyBoardStore } from '../store/studyBoardStore'

// Two separate opening lines in the same chapter. Both start with the SAME moves
// (1. e4 e5 ...), so their internal node ids collide (each game restarts node-1).
const MULTI_HTML =
  '<p>La defensa Steinitz 1. e4 e5 2. ♘f3 ♘c6 3. ♗b5 d5 fue típica. ' +
  'La defensa Tarrasch 1. d4 d5 2. c4 e6 3. ♘c3 c5 fue otra. ' +
  'Y la francesa 1. e4 e6 2. ♕e2 mostraba originalidad.</p>'

vi.mock('../api/libraryApi', () => ({
  useChapter: () => ({
    data: { title: 'Openings', html: MULTI_HTML, toc: [] },
    isLoading: false,
  }),
  useTouchBook: () => ({ mutate: vi.fn(), isPending: false }),
}))

vi.mock('react-chessboard', () => ({ Chessboard: () => <div data-testid="cb" /> }))

vi.mock('../../../shared/stockfish/useStockfishEval', () => ({
  useStockfishEval: () => ({ loading: false, scoreCp: 0, depth: 10 }),
}))

function wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return (
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={['/read/1']}>
        <Routes>
          <Route path="/read/:bookId" element={children} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  )
}

describe('BookReader multi-game highlight isolation', () => {
  beforeEach(() => useStudyBoardStore.getState().reset())

  it('gives each game occurrence a distinct composite span key', async () => {
    const { container } = render(<BookReader />, { wrapper })
    await waitFor(() => {
      expect(container.querySelectorAll('span[data-node-id]').length).toBeGreaterThan(0)
    })
    // "e4" appears in two games → two spans with DIFFERENT keys (0:node-1 / 2:node-1).
    const e4Spans = [...container.querySelectorAll('span[data-san="e4"]')]
    expect(e4Spans.length).toBe(2)
    const keys = e4Spans.map((s) => s.getAttribute('data-node-id'))
    expect(new Set(keys).size).toBe(2)
  })

  it('highlights ONLY the clicked occurrence, not the same move in other games', async () => {
    const { container } = render(<BookReader />, { wrapper })
    await waitFor(() => {
      expect(container.querySelectorAll('span[data-san="e4"]').length).toBe(2)
    })
    const e4Spans = [...container.querySelectorAll('span[data-san="e4"]')] as HTMLElement[]

    await act(async () => {
      fireEvent.click(e4Spans[0])
    })

    await waitFor(() => {
      expect(container.querySelectorAll('span.bg-yellow-300').length).toBe(1)
    })
    // The highlighted one is the clicked span, not the other game's e4.
    const highlighted = container.querySelector('span.bg-yellow-300')!
    expect(highlighted.getAttribute('data-node-id')).toBe(
      e4Spans[0].getAttribute('data-node-id'),
    )
  })
})
