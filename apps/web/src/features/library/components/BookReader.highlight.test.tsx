import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, waitFor, act } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import React from 'react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import BookReader from './BookReader'
import { useStudyBoardStore } from '../store/studyBoardStore'

vi.mock('../api/libraryApi', () => ({
  useChapter: () => ({
    data: {
      title: 'Chapter 1',
      html: '<p>The game went 1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 and white is better.</p>',
      toc: [],
    },
    isLoading: false,
  }),
  useTouchBook: () => ({ mutate: vi.fn(), isPending: false }),
}))

vi.mock('react-chessboard', () => ({
  Chessboard: ({ options }: { options?: Record<string, unknown> }) => (
    <div data-testid="chessboard" data-position={options?.position as string} />
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

describe('BookReader prose ↔ board highlight sync', () => {
  beforeEach(() => useStudyBoardStore.getState().reset())

  it('tags wrapped move spans with data-node-id', async () => {
    const { container } = render(<BookReader />, { wrapper })
    await waitFor(() => {
      expect(container.querySelectorAll('span[data-node-id]').length).toBeGreaterThan(0)
    })
  })

  it('highlights the active move span when currentNodeId changes', async () => {
    const { container } = render(<BookReader />, { wrapper })

    let firstSpan: Element | null = null
    await waitFor(() => {
      firstSpan = container.querySelector('span[data-node-id]')
      expect(firstSpan).toBeTruthy()
    })

    const nodeId = firstSpan!.getAttribute('data-node-id')!
    // Drive the store as the study board would on navigation.
    act(() => {
      useStudyBoardStore.setState({ currentNodeId: nodeId })
    })

    await waitFor(() => {
      const active = container.querySelector(`span[data-node-id="${nodeId}"]`)
      expect(active).toBeTruthy()
      expect(active!.className).toContain('bg-yellow-300')
      expect(active!.className).toContain('font-bold')
    })
  })
})
