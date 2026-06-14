import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, waitFor, act, fireEvent } from '@testing-library/react'
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

  it('highlights only the clicked move span', async () => {
    const { container } = render(<BookReader />, { wrapper })

    let firstSpan: HTMLElement | null = null
    await waitFor(() => {
      firstSpan = container.querySelector('span[data-node-id]')
      expect(firstSpan).toBeTruthy()
    })

    const spanKey = firstSpan!.getAttribute('data-node-id')!
    // Clicking the span loads the game+node (as in production) and highlights it.
    await act(async () => {
      fireEvent.click(firstSpan!)
    })

    await waitFor(() => {
      const active = container.querySelector(`span[data-node-id="${spanKey}"]`)
      expect(active!.className).toContain('bg-yellow-300')
      expect(active!.className).toContain('font-bold')
    })
    // Exactly one span is highlighted.
    expect(container.querySelectorAll('span.bg-yellow-300').length).toBe(1)
  })

  it('does not re-wrap (wipe) the prose when a move is clicked', async () => {
    const { container } = render(<BookReader />, { wrapper })
    let spans: HTMLElement[] = []
    await waitFor(() => {
      spans = [...container.querySelectorAll<HTMLElement>('span[data-node-id]')]
      expect(spans.length).toBeGreaterThan(1)
    })
    const before = spans.length

    // Regression: the wrapping effect used to depend on the active-node key, so a
    // click re-ran the unwrap+rewrap DOM surgery and React's innerHTML
    // reconciliation wiped the spans — killing every highlight and interaction.
    await act(async () => {
      fireEvent.click(spans[1])
    })

    const after = container.querySelectorAll<HTMLElement>('span[data-node-id]')
    expect(after.length).toBe(before)
    expect(container.querySelectorAll('span.bg-yellow-300').length).toBe(1)
  })
})
