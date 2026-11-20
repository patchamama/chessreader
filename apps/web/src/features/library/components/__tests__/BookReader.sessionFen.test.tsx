import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, waitFor, act } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import React from 'react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import BookReader from '../BookReader'
import { useStudyBoardStore } from '../../store/studyBoardStore'
import { useSessionFenStore } from '../../imageAi/sessionFens'

// llm-assistant-round S7: a position accepted for a diagram makes the moves
// that follow it in the text recognised from that position.

const FEN = '6k1/5ppp/8/8/8/8/8/R5K1 w - - 0 1'
vi.mock('../../api/libraryApi', () => ({
  useChapter: () => ({
    data: { title: 'Chapter', html: '<p>Intro.</p>\n<p><img src="pos.png" alt="diagram"></p>\n<p>1.Kf1 Kf8 2.Ke2 Kg8 3.Ra8#</p>', toc: [] },
    isLoading: false,
  }),
  useTouchBook: () => ({ mutate: vi.fn(), isPending: false }),
  useBookTitle: () => null,
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
  useSessionFenStore.setState({ fens: {} })
  Element.prototype.scrollIntoView = vi.fn()
})

describe('a diagram position accepted this session (S7)', () => {
  it('the moves after the diagram are read from that position', async () => {
    const view = render(<BookReader />, { wrapper })
    await waitFor(() => expect(view.container.querySelector('[data-diagram-src]')).not.toBeNull())
    expect(view.container.querySelector('span[data-san="Ke2"]')).toBeNull()
    const src = view.container.querySelector('[data-diagram-src]')!.getAttribute('data-diagram-src')!
    act(() => useSessionFenStore.getState().setFen(src, FEN))
    await waitFor(() => expect(view.container.querySelector('span[data-san="Ke2"]')).not.toBeNull())
  })
})
