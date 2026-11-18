import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, waitFor, fireEvent, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import React from 'react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import BookReader from '../BookReader'
import { useStudyBoardStore } from '../../store/studyBoardStore'
import { useGameRewriteStore } from '../../store/gameRewriteStore'
import { useReaderViewStore } from '../../store/readerViewStore'
import { useBusyStore } from '../../../../shared/layout/busyStore'

// reader-errata-round T6: recomment one game in place (S3), show/hide the book
// comments with a new pick on re-enable (S4) and the text column width (S9).

const CHAPTER = [
  '<p>Intro of the chapter.</p>',
  '<p>Game 1</p>',
  '<p>Anderssen – Kieseritzky</p>',
  '<p>1. e4 e5 2. Qh5</p>',
  '<p>A wild queen sortie.</p>',
  '<p><img src="data:image/png;base64,AA==" alt="diagram"/></p>',
  '<p>(2... g6 3. Qf3)</p>',
  '<p>2... Nc6 3. Bc4 Nf6 4. Qxf7#</p>',
  '<p>A famous finish.</p>',
  '<p>Game 2</p>',
  '<p>1. d4 d5 2. c4 e6</p>',
].join('\n')

const ALTS = [{ text: 'First remark.', source: 'Book A' }, { text: 'Second remark.', source: 'Book B', gameId: 'g9', ply: 4 }]
const WITH_QUOTE = `<p>1. e4 e5 2. Nf3 Nc6</p>\n<blockquote class="human-comment" data-no-recognition data-comment-alternatives='${JSON.stringify(ALTS)}'><p>First remark.</p><footer>— Book A</footer></blockquote>\n<p>3. Bb5 a6</p>`

const h = vi.hoisted(() => ({ html: '' }))
vi.mock('../../api/libraryApi', () => ({
  useChapter: () => ({ data: { title: 'Chapter', html: h.html, toc: [] }, isLoading: false }),
  useTouchBook: () => ({ mutate: vi.fn(), isPending: false }),
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
  recommentGame.mockReset()
  Element.prototype.scrollIntoView = vi.fn()
})
afterEach(() => vi.restoreAllMocks())

const content = (c: HTMLElement) => c.querySelector('.epub-content') as HTMLElement

async function renderReader(html: string, san: string) {
  h.html = html
  const view = render(<BookReader />, { wrapper })
  await waitFor(() => expect(view.container.querySelector(`span[data-san="${san}"]`)).not.toBeNull())
  return view
}

describe('comment one game again in place (S3)', () => {
  it('puts a comment-again icon right after the layout switch of every game marker', async () => {
    const { container } = await renderReader(CHAPTER, 'Qxf7#')
    const starts = [...content(container).querySelectorAll('[data-game-marker="start"]')]
    expect(starts).toHaveLength(2)
    starts.forEach((start, i) => {
      const toggle = start.querySelector(`[data-layout-toggle="${i}"]`)!
      const recomment = toggle.nextElementSibling as HTMLElement
      expect(recomment.getAttribute('data-recomment')).toBe(String(i))
      expect(recomment.getAttribute('aria-label')).toBe('Comment this game again')
      expect(recomment.getAttribute('aria-pressed')).toBe('false')
    })
  })

  it('replaces only that game (comments, variations, images) with new commentary, under the spinner; a second click restores it', async () => {
    const labels: string[] = []
    const unsub = useBusyStore.subscribe((s) => s.tasks.forEach((t) => labels.push(t.label)))
    recommentGame.mockResolvedValue('1. e4 e5\nA new remark.\n2. Qh5 Nc6 3. Bc4 Nf6 4. Qxf7#')
    const { container } = await renderReader(CHAPTER, 'Qxf7#')
    fireEvent.click(content(container).querySelector('[data-recomment="0"]')!)
    await waitFor(() => expect(content(container).textContent).toContain('A new remark.'))
    unsub()
    expect(labels).toContain('Commenting the game again')
    expect(recommentGame.mock.calls[0][1]).toBe(0)
    const text = content(container).textContent!
    expect(text).not.toContain('A wild queen sortie.')
    expect(text).not.toContain('2... g6 3. Qf3')
    expect(content(container).querySelector('img')).toBeNull()
    expect(text).toContain('Intro of the chapter.')
    expect(text).toContain('A famous finish.')
    expect(text).toContain('1. d4 d5 2. c4 e6')
    expect(window.location.pathname).not.toContain('/read/-1')
    // Still read as the same two games: the new moves are playable.
    await waitFor(() => expect(content(container).querySelectorAll('[data-game-marker="start"]')).toHaveLength(2))
    expect(content(container).querySelector('span[data-san="Qxf7#"]')).not.toBeNull()
    // Kept for the next time the chapter renders.
    expect(JSON.parse(localStorage.getItem('chessreader-game-rewrites-v1')!)['7:1']).toEqual({ 0: { text: '1. e4 e5\nA new remark.\n2. Qh5 Nc6 3. Bc4 Nf6 4. Qxf7#' } })

    const again = content(container).querySelector('[data-game-marker="start"] [data-recomment="0"]') as HTMLElement
    expect(again.getAttribute('aria-label')).toBe('Restore the book\'s text')
    expect(again.getAttribute('aria-pressed')).toBe('true')
    fireEvent.click(again)
    await waitFor(() => expect(content(container).textContent).toContain('A wild queen sortie.'))
    expect(content(container).textContent).not.toContain('A new remark.')
    expect(content(container).textContent).toContain('2... g6 3. Qf3')
    // The restore runs under the spinner too (study-tools-round S6): the diagram mounts right after.
    await waitFor(() => expect(content(container).querySelector('img')).not.toBeNull())
    expect(recommentGame).toHaveBeenCalledTimes(1)
  })
})

describe('show or hide the book comments (S4)', () => {
  it('a comment icon before the board button hides and shows them, picking another remark when shown again', async () => {
    const { container } = await renderReader(WITH_QUOTE, 'Bb5')
    const toggle = screen.getByRole('button', { name: 'Hide book comments' })
    expect(toggle.getAttribute('aria-pressed')).toBe('true')
    const board = screen.getByTitle(/study board/)
    expect(toggle.nextElementSibling).toBe(board)

    fireEvent.click(toggle)
    expect(container.querySelector('.hide-book-comments .epub-content blockquote.human-comment')).not.toBeNull()
    expect(JSON.parse(localStorage.getItem('chessreader-reader-view-v1')!).bookComments).toBe(false)

    vi.spyOn(Math, 'random').mockReturnValue(0.9)
    fireEvent.click(screen.getByRole('button', { name: 'Show book comments' }))
    await waitFor(() => expect(content(container).querySelector('blockquote.human-comment p')!.textContent).toBe('Second remark.'))
    expect(container.querySelector('.hide-book-comments')).toBeNull()
    expect(content(container).querySelector('span[data-san="Bb5"]')).not.toBeNull()
  })
})

describe('text column width (S9)', () => {
  it('an icon opens a width control that narrows the text live and is remembered', async () => {
    const { container } = await renderReader(WITH_QUOTE, 'Bb5')
    const column = () => container.querySelector('[data-testid="reader-column"]') as HTMLElement
    // In the top bar, with the layout and board switches.
    expect(screen.getByRole('navigation').contains(screen.getByRole('button', { name: 'Reading width' }))).toBe(true)
    expect(column().style.maxWidth).toBe('')
    fireEvent.click(screen.getByRole('button', { name: 'Reading width' }))
    fireEvent.change(screen.getByRole('slider', { name: 'Text column width' }), { target: { value: '700' } })
    expect(column().style.maxWidth).toBe('700px')
    expect(JSON.parse(localStorage.getItem('chessreader-reader-view-v1')!).textWidth).toBe(700)
    fireEvent.click(screen.getByRole('button', { name: 'Full width' }))
    expect(column().style.maxWidth).toBe('')
  })
})
