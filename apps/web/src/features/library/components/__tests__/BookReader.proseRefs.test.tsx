import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, waitFor, fireEvent, act } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import React from 'react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import BookReader from '../BookReader'
import { useStudyBoardStore } from '../../store/studyBoardStore'

// Synthetic prose: a game start, then references to ideas, plans, advances and files.
const HTML =
  '<p>1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 4. Ba4 Nf6 5. O-O Be7 6. Re1 b5 7. Bb3 d6 8. c3 O-O 9. h3 Nb8 10. d4 Nbd7 ' +
  '10...Nbd7, con idea de Nf6. Plan (a6-a5, Rb8) y presión sobre las columnas b y c, con el avance h2-h4-h5, y luego presión sobre los peones del flanco de rey.</p>'

vi.mock('../../api/libraryApi', () => ({
  useChapter: () => ({ data: { title: 'T', html: HTML, toc: [] }, isLoading: false }),
  useTouchBook: () => ({ mutate: vi.fn(), isPending: false }),
  useBookTitle: () => null,
}))
vi.mock('react-chessboard', () => ({
  Chessboard: ({ options }: { options?: Record<string, unknown> }) => <div data-testid="cb" data-position={options?.position as string} />,
}))
vi.mock('../../../../shared/stockfish/useStockfishEval', () => ({
  useStockfishEval: () => ({ loading: false, scoreCp: 0, depth: 10 }),
}))

function wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return (
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={['/read/1']}>
        <Routes><Route path="/read/:bookId" element={children} /></Routes>
      </MemoryRouter>
    </QueryClientProvider>
  )
}

describe('BookReader prose references (S13-S15)', () => {
  beforeEach(() => useStudyBoardStore.getState().reset())

  it('paints the references and a click lights files and arrows on the study board', async () => {
    const { container } = render(<BookReader />, { wrapper })
    await waitFor(() => expect(container.querySelectorAll('span[data-ref-key]').length).toBeGreaterThanOrEqual(3))
    const spans = [...container.querySelectorAll<HTMLElement>('span[data-ref-key]')]
    const byText = (t: string) => spans.find((s) => s.textContent === t)!

    await act(async () => { fireEvent.click(byText('columnas b y c')) })
    expect(useStudyBoardStore.getState().isolatedHighlight?.line).toHaveLength(16)

    await act(async () => { fireEvent.click(byText('h2-h4-h5')) })
    expect(useStudyBoardStore.getState().isolatedHighlight?.arrows).toEqual([['h2', 'h4'], ['h4', 'h5']])

    // The king-side pawns light one after another (white pawns of the position, lit progressively).
    vi.useFakeTimers()
    await act(async () => { fireEvent.click(byText('peones del flanco de rey')) })
    const lit = () => useStudyBoardStore.getState().isolatedHighlight?.line ?? []
    const first = lit().length
    await act(async () => { vi.advanceTimersByTime(5000) })
    expect(lit().length).toBeGreaterThanOrEqual(first)
    vi.useRealTimers()

    await act(async () => { fireEvent.click(byText('a6-a5')) })
    expect(useStudyBoardStore.getState().isolatedHighlight?.arrows).toEqual([['a6', 'a5']])
  })
})
