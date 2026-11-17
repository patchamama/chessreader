import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, waitFor, fireEvent, act, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import React from 'react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import BookReader from './BookReader'
import { useStudyBoardStore } from '../store/studyBoardStore'
import { useSettingsStore } from '../../../shared/settings/settingsStore'

const ANALYSIS_HTML =
  '<p>1. e4 e5 2. ♘f3 ♘c6 3. ♗c4 ♗c5 4. b4 ♗xb4 5. c3 ♗a5 6. d4 exd4 7. O-O d3 ' +
  '8. ♕b3 ♕f6 9. e5 ♕g6 10. ♖e1 ♘ge7 11. ♗a3 b5 12. ♕xb5 ♖b8 13. ♕a4 ♗b6 ' +
  '14. ♘bd2 ♗b7 15. ♘e4 ♕f5 16. ♗xd3 ♕h5 17. ♘f6+ gxf6 18. exf6 ♖g8 ' +
  '19. ♖ad1!! ♕xf3 20. ♖xe7+ ♘xe7 21. ♕xd7+! ♔xd7 22. ♗f5+ ♔e8 23. ♗d7+ ♔f8 24. ♗xe7# mate 1-0</p>' +
  '<p>19... ♖g4 20. ♖xe7+ ♔d8 fuerte. El mejor juego sería 21. ♖xd7+ ♔c8 22. ♖d8+ ♔xd8 ' +
  '(22... ♘xd8 23. ♕d7+!); 23. ♗f5+ (23. ♗e2+ ♘d4!) ♕xd1+ 24. ♕xd1+ ♘d4 25. ♗h3 ♗d5 incierto.</p>'

vi.mock('../api/libraryApi', () => ({
  useChapter: () => ({
    data: { title: 'Anderssen', html: ANALYSIS_HTML, toc: [] },
    isLoading: false,
  }),
  useTouchBook: () => ({ mutate: vi.fn(), isPending: false }),
}))

vi.mock('react-chessboard', () => ({
  Chessboard: () => <div data-testid="chessboard" />,
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

const queryNodeId = (container: HTMLElement, nodeId: string) =>
  container.querySelector(`span[data-node-id="${nodeId}"]`)

describe('BookReader variation underline + chooser', () => {
  beforeEach(() => {
    useStudyBoardStore.getState().reset()
    // This fixture is single-line post-result analysis → legacy algorithm.
    useSettingsStore.getState().set({ recognitionAlgorithm: 2 })
  })

  it('underlines a move that has alternatives ahead (Rd8+)', async () => {
    const { container } = render(<BookReader />, { wrapper })
    let span: Element | null = null
    await waitFor(() => {
      span = [...container.querySelectorAll('span[data-san="Rd8+"]')].at(-1) ?? null
      expect(span).toBeTruthy()
    })
    expect(span!.className).toContain('underline')
    expect(span!.className).toContain('decoration-dotted')
  })

  it('does NOT underline a plain move with no fork (e4)', async () => {
    const { container } = render(<BookReader />, { wrapper })
    let span: Element | null = null
    await waitFor(() => {
      span = container.querySelector('span[data-san="e4"]')
      expect(span).toBeTruthy()
    })
    expect(span!.className).not.toContain('decoration-dotted')
  })

  it('glues the move number into the wrapped span (19. ♖ad1!!)', async () => {
    const { container } = render(<BookReader />, { wrapper })
    let span: Element | null = null
    await waitFor(() => {
      span = container.querySelector('span[data-san="Rad1"]')
      expect(span).toBeTruthy()
    })
    expect(span!.textContent).toMatch(/^19\.\s*♖ad1/)
  })

  it('opens a chooser when clicking a fork move (Rd8+ → Kxd8 + Nxd8)', async () => {
    const { container } = render(<BookReader />, { wrapper })
    let span: Element | null = null
    await waitFor(() => {
      span = [...container.querySelectorAll('span[data-san="Rd8+"]')].at(-1) ?? null
      expect(span).toBeTruthy()
    })
    act(() => {
      fireEvent.click(span!)
    })
    await waitFor(() => {
      expect(screen.getByRole('menu', { name: /choose continuation/i })).toBeInTheDocument()
    })
    // The chooser lists the mainline continuation + the variation alternative.
    expect(screen.getByText('Mainline')).toBeInTheDocument()
    void queryNodeId
  })
})
