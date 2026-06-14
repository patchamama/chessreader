import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, waitFor, fireEvent, act } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import React from 'react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import BookReader from './BookReader'
import { useStudyBoardStore } from '../store/studyBoardStore'

const HTML = '<p>The game went 1. e4 e5 2. Nf3 Nc6 3. Bb5 a6.</p>'

// Mutable loading flag — flips to false after first render to reproduce the real
// app: the content <div ref> does NOT exist while the chapter is loading, so the
// delegated click/hover listeners must (re)attach once it mounts.
const state = { loading: true }

vi.mock('../api/libraryApi', () => ({
  useChapter: () => ({
    data: state.loading ? undefined : { title: 'Ch', html: HTML, toc: [] },
    isLoading: state.loading,
  }),
  useTouchBook: () => ({ mutate: vi.fn(), isPending: false }),
}))

vi.mock('react-chessboard', () => ({
  Chessboard: ({ options }: { options?: Record<string, unknown> }) => (
    <div data-testid="cb" data-position={options?.position as string} />
  ),
}))

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

describe('BookReader delegated handlers after async load', () => {
  beforeEach(() => {
    useStudyBoardStore.getState().reset()
    state.loading = true
  })

  it('click loads the study board even when content mounts after loading', async () => {
    const { container, rerender } = render(<BookReader />, { wrapper })
    // First render: still loading → no content div, listeners attach to nothing.
    expect(container.querySelector('span[data-node-id]')).toBeNull()

    // Chapter arrives → div mounts, spans get wrapped, listeners must re-bind.
    state.loading = false
    await act(async () => {
      rerender(<BookReader />)
    })
    let span: HTMLElement | null = null
    await waitFor(() => {
      span = container.querySelector('span[data-node-id]')
      expect(span).toBeTruthy()
    })

    await act(async () => {
      fireEvent.click(span!)
    })
    // Clicking must have driven the study board (regression: it did nothing).
    expect(useStudyBoardStore.getState().activeGame).not.toBeNull()
  })
})
