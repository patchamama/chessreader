import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, waitFor, fireEvent, screen, within } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import React from 'react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import BookReader from '../BookReader'
import { useStudyBoardStore } from '../../store/studyBoardStore'
import { useGameRewriteStore } from '../../store/gameRewriteStore'
import { useReaderViewStore } from '../../store/readerViewStore'
import { useBusyStore } from '../../../../shared/layout/busyStore'
import { useEvalColoringStore } from '../../store/evalColoringStore'
import { setReviewEngine } from '../../review/reviewStore'

// reader-analysis-round T4b: "Comment this game again" moves a progress bar in
// the status footer (S5); moves of fragments without a position are marks (S3);
// moves coloured by their evaluation (S11).

const CHAPTER = [
  '<p>Game 1</p>',
  '<p>1. e4 e5 2. Qh5 Nc6 3. Bc4 Nf6 4. Qxf7#</p>',
].join('\n')

const h = vi.hoisted(() => ({ html: '' }))
vi.mock('../../api/libraryApi', () => ({
  useChapter: () => ({ data: { title: 'Chapter', html: h.html, toc: [] }, isLoading: false }),
  useTouchBook: () => ({ mutate: vi.fn(), isPending: false }),
  useBookTitle: () => null,
}))
const recommentGame = vi.hoisted(() => vi.fn())
vi.mock('../../review/recommentGame', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../review/recommentGame')>()),
  recommentGame,
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
  useGameRewriteStore.setState({ rewrites: {} })
  useReaderViewStore.setState({ bookComments: true, textWidth: null, commentPick: 0 })
  useBusyStore.setState({ tasks: [] })
  useEvalColoringStore.getState().reset()
  recommentGame.mockReset()
  Element.prototype.scrollIntoView = vi.fn()
})
afterEach(() => { vi.restoreAllMocks(); setReviewEngine(null) })

const content = (c: HTMLElement) => c.querySelector('.epub-content') as HTMLElement

describe('comment this game again shows its progress (S5)', () => {
  it('the task in the footer moves with each position the engine analyses', async () => {
    let finish!: (text: string) => void
    recommentGame.mockImplementation((_g, _i, _t, _o, progress?: { onProgress?: (d: number, t: number) => void }) => {
      progress?.onProgress?.(3, 6)
      return new Promise<string>((r) => { finish = r })
    })
    h.html = CHAPTER
    const { container } = render(<BookReader />, { wrapper })
    await waitFor(() => expect(content(container).querySelector('[data-recomment="0"]')).not.toBeNull())
    fireEvent.click(content(container).querySelector('[data-recomment="0"]')!)
    await waitFor(() => expect(useBusyStore.getState().tasks[0]?.progress).toBe(0.5))
    expect(useBusyStore.getState().tasks[0].label).toBe('Commenting the game again')
    finish('1. e4 e5\nA new remark.\n2. Qh5 Nc6 3. Bc4 Nf6 4. Qxf7#')
    await waitFor(() => expect(content(container).textContent).toContain('A new remark.'))
    await waitFor(() => expect(useBusyStore.getState().tasks).toEqual([]))
  })
})

describe('moves of a fragment without a position are shown as marks (S3)', () => {
  it('paints each move of the fragment as a square mark, and a click lights its square without moving the board', async () => {
    h.html = '<p>En la posición del diagrama:</p><p><img src="d197.png" alt="" /></p><p>21...♖xe3 22.♖xe3 ♔f8 y ganan.</p>'
    const { container } = render(<BookReader />, { wrapper })
    await waitFor(() => expect(content(container).querySelectorAll('span[data-iso-square]').length).toBe(3))
    const marks = [...content(container).querySelectorAll<HTMLElement>('span[data-iso-square]')]
    expect(marks.map((m) => [m.textContent, m.dataset.isoSquare])).toEqual([['♖xe3', 'e3'], ['♖xe3', 'e3'], ['♔f8', 'f8']])
    expect(content(container).querySelector('span[data-san]')).toBeNull()
    fireEvent.click(marks[0])
    expect(useStudyBoardStore.getState().activeGame).toBeNull()
  })

  it('the moves of a game are still game moves next to such a fragment', async () => {
    h.html = '<p>1. e4 e5 2. Nf3 Nc6</p><p>Diagrama</p><p>21...♖xe3 22.♖xe3</p>'
    const { container } = render(<BookReader />, { wrapper })
    await waitFor(() => expect(content(container).querySelectorAll('span[data-san]').length).toBe(4))
    expect([...content(container).querySelectorAll('span[data-iso-square]')].map((m) => m.textContent)).toEqual(['♖xe3', '♖xe3'])
  })
})

describe('moves coloured by their evaluation (S11)', () => {
  const MATE = '<p>Game 1</p><p>1. e4 e5 2. Qh5 Ke7</p>'

  it('the top bar button rates the games of the chapter with the engine and colours every move', async () => {
    // Level everywhere except after 2...Ke7 (White to move, winning): Ke7 is a blunder.
    setReviewEngine(async (fen) => [{ idx: 1, pv: [], depth: 8, scoreCp: fen.startsWith('rnbq1bnr/ppppkppp') ? 900 : 0 }])
    h.html = MATE
    const { container } = render(<BookReader />, { wrapper })
    await waitFor(() => expect(content(container).querySelector('span[data-san="Ke7"]')).not.toBeNull())
    expect(content(container).querySelector('[data-eval-quality]')).toBeNull()
    const nav = within(screen.getByRole('navigation'))
    expect(nav.getByRole('button', { name: 'Evaluate every move of the whole book' })).toBeInTheDocument()
    fireEvent.click(nav.getByRole('button', { name: 'Colour the moves by their evaluation' }))
    await waitFor(() => expect(content(container).querySelector('span[data-san="Ke7"]')?.getAttribute('data-eval-quality')).toBe('bad'))
    expect(content(container).querySelector('span[data-san="e4"]')?.getAttribute('data-eval-quality')).toBe('good')
    // Switched off: the colours go away, the ratings are kept.
    fireEvent.click(nav.getByRole('button', { name: 'Colour the moves by their evaluation' }))
    await waitFor(() => expect(content(container).querySelector('[data-eval-quality]')).toBeNull())
    expect(Object.keys(useEvalColoringStore.getState().entries)).toHaveLength(1)
  })
})
