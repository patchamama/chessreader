import { describe, it, expect, vi, beforeEach } from 'vitest'
import { act, fireEvent, render, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import React from 'react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import BookReader from '../BookReader'
import { useStudyBoardStore } from '../../store/studyBoardStore'
import { useSettingsStore } from '../../../../shared/settings/settingsStore'
import { useAnalysisBoards } from '../../analysis/analysisBoards'

const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'
const HTML = '<p>1. e4 e5 2. ♘f3 ♘c6 3. ♗b5 a6</p>'
  + `<blockquote class="human-comment" data-no-recognition><p>Or <button type="button" class="line-to-board" data-line-start="${START}" data-line-moves="d4 d5">Board</button></p></blockquote>`

vi.mock('../../api/libraryApi', () => ({
  useChapter: () => ({ data: { title: 'Notation', html: HTML, toc: [] }, isLoading: false }),
  useTouchBook: () => ({ mutate: vi.fn(), isPending: false }),
}))
vi.mock('react-chessboard', () => ({ Chessboard: () => <div data-testid="chessboard" /> }))
vi.mock('../../../../shared/stockfish/useStockfishEval', () => ({
  useStockfishEval: () => ({ loading: false, scoreCp: 0, depth: 10 }),
}))

function wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  qc.setQueryData(['library', 'books'], [{ id: 1, title: 'My Book', author: '', createdAt: '', description: '' }])
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

beforeEach(() => {
  useStudyBoardStore.getState().reset()
  useAnalysisBoards.setState({ boards: [], active: null })
  useSettingsStore.getState().set({ language: 'es', notationStyle: 'letters', recognitionAlgorithm: 2 })
})

describe('BookReader move spans follow the piece notation (S12)', () => {
  it('writes the book moves with the letters of the language, keeps the book spelling and switches live', async () => {
    const { container } = render(<BookReader />, { wrapper })
    let knight: HTMLElement | null = null
    await waitFor(() => {
      knight = container.querySelector<HTMLElement>('span[data-san="Nf3"]')
      expect(knight).toBeTruthy()
    })
    expect(knight!.textContent).toMatch(/Cf3$/)
    expect(knight!.getAttribute('data-raw')).toMatch(/♘f3$/)
    expect(container.querySelector('span[data-san="Bb5"]')!.textContent).toMatch(/Ab5$/)

    act(() => useSettingsStore.getState().set({ notationStyle: 'figurine' }))
    expect(container.querySelector('span[data-san="Nf3"]')!.textContent).toMatch(/♘f3$/)
    act(() => useSettingsStore.getState().set({ language: 'de', notationStyle: 'letters' }))
    expect(container.querySelector('span[data-san="Nf3"]')!.textContent).toMatch(/Sf3$/)
  })
})

describe('BookReader names the analysis boards it opens after the book (S11)', () => {
  it('a line opened on a new analysis board carries the book name for its tab', async () => {
    const { container } = render(<BookReader />, { wrapper })
    await waitFor(() => expect(container.querySelector('button.line-to-board')).toBeTruthy())
    fireEvent.click(container.querySelector('button.line-to-board') as HTMLElement)
    expect(useAnalysisBoards.getState().boards[0]).toMatchObject({ moves: ['d4', 'd5'], source: 'My Book' })
  })
})
