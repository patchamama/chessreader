import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, waitFor, fireEvent, act } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import React from 'react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import BookReader from './BookReader'
import { useStudyBoardStore } from '../store/studyBoardStore'

// The regression: an isolated prose move (—d5—, —d4—) appears BEFORE a later
// real game whose mainline actually contains d5 and d4. The old per-SAN ordered
// resolver let the isolated occurrence consume a real node from the later game,
// painting prose as a playable move. The unified resolver orders ALL occurrences
// (real + isolated) by source position, so each is classified at its own spot.
const HTML =
  '<p>India: 1. d4 ♘f6 (los hipermodernos desdeñaban PD —d5— contra PD —d4—, ' +
  'PR —e5— contra PR —e4—; buscaban la asimetría). Más tarde: la Tarrasch ' +
  '1. d4 d5 2. c4 e6 3. ♘c3 c5 fue la respuesta clásica.</p>'

vi.mock('../api/libraryApi', () => ({
  useChapter: () => ({ data: { title: 'Hipermoderna', html: HTML, toc: [] }, isLoading: false }),
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

describe('BookReader isolated moves do not steal real nodes', () => {
  beforeEach(() => useStudyBoardStore.getState().reset())

  it('classifies the FIRST d5/d4 as isolated and the LATER ones as real moves', async () => {
    const { container } = render(<BookReader />, { wrapper })
    await waitFor(() => {
      expect(container.querySelectorAll('span[data-iso-square]').length).toBeGreaterThan(0)
    })

    const isoSquares = [...container.querySelectorAll('span[data-iso-square]')].map((s) =>
      s.getAttribute('data-iso-square'),
    )
    // The parenthesised prose tokens are isolated squares.
    expect(isoSquares).toEqual(expect.arrayContaining(['d5', 'd4', 'e5', 'e4']))

    // The Tarrasch line's d5 IS a real, clickable game move (it was being stolen).
    const realSans = [...container.querySelectorAll('span[data-node-id]')].map((s) =>
      s.getAttribute('data-san'),
    )
    expect(realSans).toEqual(expect.arrayContaining(['d4', 'd5', 'c4', 'e6', 'Nc3', 'c5']))
    // Exactly one real d5 node (the Tarrasch one), not zero (stolen) nor leaked prose.
    expect(container.querySelectorAll('span[data-node-id][data-san="d5"]').length).toBe(1)
  })

  it('a bare pawn isolated move highlights the square but places no piece', async () => {
    const { container } = render(<BookReader />, { wrapper })
    let iso: HTMLElement | null = null
    await waitFor(() => {
      iso = container.querySelector('span[data-iso-square="e4"]')
      expect(iso).toBeTruthy()
    })
    await act(async () => {
      fireEvent.click(iso!)
    })
    // Pawn → piece 'p'; StudyBoard must NOT overlay a pawn for bare pawn moves.
    const hl = useStudyBoardStore.getState().isolatedHighlight
    expect(hl).toEqual({ square: 'e4', piece: 'p' })
  })
})
