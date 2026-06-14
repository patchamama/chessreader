import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, waitFor, fireEvent, act } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import React from 'react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import BookReader from './BookReader'
import { useStudyBoardStore } from '../store/studyBoardStore'

// A paragraph mixing real game moves with isolated prose moves (—d5—, casilla e4).
// Only d4/Nf6/c4/e6/Nc3/Bb4 are reproducible; d5/d4/e5/e4 inside the parenthesis
// and the trailing "casilla e4" are isolated.
const HTML =
  '<p>La defensa Nimzo-India: 1. d4 ♘f6 (los hipermodernos desdeñaban PD —d5— ' +
  'contra PD —d4—, PR —e5— contra PR —e4—); 2. c4 e6 3. ♘c3 ♗b4. ' +
  'Las negras controlan la casilla e4.</p>'

vi.mock('../api/libraryApi', () => ({
  useChapter: () => ({
    data: { title: 'Nimzo', html: HTML, toc: [] },
    isLoading: false,
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

describe('BookReader isolated prose moves', () => {
  beforeEach(() => useStudyBoardStore.getState().reset())

  it('renders real moves as clickable move spans and isolated moves separately', async () => {
    const { container } = render(<BookReader />, { wrapper })
    await waitFor(() => {
      expect(container.querySelectorAll('span[data-node-id]').length).toBeGreaterThan(0)
    })
    // Reproducible game moves carry data-node-id + data-fen.
    const moveSans = [...container.querySelectorAll('span[data-node-id]')].map((s) =>
      s.getAttribute('data-san'),
    )
    expect(moveSans).toEqual(expect.arrayContaining(['d4', 'Nf6', 'c4', 'e6', 'Nc3', 'Bb4']))
    // Isolated tokens are NOT move spans; they carry data-iso-square instead.
    const isoSquares = [...container.querySelectorAll('span[data-iso-square]')].map((s) =>
      s.getAttribute('data-iso-square'),
    )
    expect(isoSquares).toEqual(expect.arrayContaining(['d5', 'e5', 'e4']))
    // No isolated token leaked into the reproducible move spans.
    expect(container.querySelectorAll('span[data-node-id][data-san="d5"]').length).toBe(0)
  })

  it('clicking an isolated move highlights its square on the study board', async () => {
    const { container } = render(<BookReader />, { wrapper })
    let iso: HTMLElement | null = null
    await waitFor(() => {
      iso = container.querySelector('span[data-iso-square="d5"]')
      expect(iso).toBeTruthy()
    })
    await act(async () => {
      fireEvent.click(iso!)
    })
    const hl = useStudyBoardStore.getState().isolatedHighlight
    expect(hl).toEqual({ square: 'd5', piece: 'p' })
  })

  it('exposes a FEN on each real move span for the hover tooltip', async () => {
    const { container } = render(<BookReader />, { wrapper })
    await waitFor(() => {
      expect(container.querySelectorAll('span[data-node-id]').length).toBeGreaterThan(0)
    })
    const span = container.querySelector('span[data-node-id]')!
    const fen = span.getAttribute('data-fen')
    expect(fen).toBeTruthy()
    // A FEN has 6 space-separated fields.
    expect(fen!.split(' ').length).toBe(6)
  })
})
