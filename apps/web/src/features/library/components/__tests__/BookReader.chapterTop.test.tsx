import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, waitFor, fireEvent, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import React from 'react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import BookReader from '../BookReader'
import { useStudyBoardStore } from '../../store/studyBoardStore'

// reader-analysis-round S1: opening a chapter shows its beginning, not its first
// move; S4: the top bar names the open book next to the chapter.

const CHAPTERS: Record<number, string> = {
  1: '<p>Intro one.</p>\n<p>1. e4 e5 2. Nf3 Nc6</p>',
  2: '<p>Intro two.</p>\n<p>1. d4 d5 2. c4 e6</p>',
}
vi.mock('../../api/libraryApi', () => ({
  useChapter: (_id: number, n: number) => ({
    data: { title: `Chapter ${n}`, html: CHAPTERS[n], toc: [{ order: 1, title: 'Chapter 1' }, { order: 2, title: 'Chapter 2' }] },
    isLoading: false,
  }),
  useTouchBook: () => ({ mutate: vi.fn(), isPending: false }),
  useBookTitle: () => 'My System',
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

const scrollCalls = vi.fn()
beforeEach(() => {
  localStorage.clear()
  useStudyBoardStore.getState().reset()
  scrollCalls.mockReset()
  Element.prototype.scrollIntoView = function (this: Element, arg?: boolean | ScrollIntoViewOptions) {
    scrollCalls(this, arg)
  }
})

const moveScrolls = () => scrollCalls.mock.calls.filter(([el]) => (el as HTMLElement).dataset?.nodeId)

describe('a chapter opens at its beginning (S1)', () => {
  it('does not scroll to the first move that the board loads on its own', async () => {
    const view = render(<BookReader />, { wrapper })
    await waitFor(() => expect(view.container.querySelector('span[data-san="Nc6"]')).not.toBeNull())
    await waitFor(() => expect(useStudyBoardStore.getState().activeGame).not.toBeNull())
    expect(moveScrolls()).toHaveLength(0)
  })

  it('a chapter never opened, picked with the next button, starts at its top without following its first move', async () => {
    const view = render(<BookReader />, { wrapper })
    await waitFor(() => expect(view.container.querySelector('span[data-san="Nc6"]')).not.toBeNull())
    const main = view.container.querySelector('main') as HTMLElement
    main.scrollTop = 500
    fireEvent.click(screen.getAllByRole('button', { name: 'Next chapter' })[0])
    await waitFor(() => expect(view.container.querySelector('span[data-san="e6"]')).not.toBeNull())
    await waitFor(() => expect(useStudyBoardStore.getState().activeGame?.mainline.length).toBe(4))
    expect(main.scrollTop).toBe(0)
    expect(moveScrolls()).toHaveLength(0)
  })

  it('a move the reader plays is still followed', async () => {
    const view = render(<BookReader />, { wrapper })
    await waitFor(() => expect(view.container.querySelector('span[data-san="Nc6"]')).not.toBeNull())
    fireEvent.click(view.container.querySelector('span[data-san="Nc6"]') as HTMLElement)
    await waitFor(() => expect(moveScrolls().length).toBeGreaterThan(0))
  })
})

describe('the top bar names the open book (S4)', () => {
  it('shows the book title next to the chapter title', async () => {
    render(<BookReader />, { wrapper })
    expect(await screen.findByTestId('reader-book-title')).toHaveTextContent('My System')
  })
})
