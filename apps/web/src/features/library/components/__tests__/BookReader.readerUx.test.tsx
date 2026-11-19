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

// study-tools-round T2: games in containers updated under a spinner, keeping the
// reader's place and flashing what changed (S6); the first visible line kept
// when the column width changes (S10); study tools in the top bar (S7).

const CHAPTER = [
  '<p>Intro of the chapter.</p>',
  '<p>Game 1</p>',
  '<p>Anderssen – Kieseritzky</p>',
  '<p>1. e4 e5 2. Qh5</p>',
  '<p>A wild queen sortie.</p>',
  '<p>2... Nc6 3. Bc4 Nf6 4. Qxf7#</p>',
  '<p>A famous finish.</p>',
  '<p>Game 2</p>',
  '<p>1. d4 d5 2. c4 e6</p>',
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
  recommentGame.mockReset()
  Element.prototype.scrollIntoView = vi.fn()
})
afterEach(() => vi.restoreAllMocks())

const content = (c: HTMLElement) => c.querySelector('.epub-content') as HTMLElement
const rect = (top: number, height: number) => ({
  top, bottom: top + height, height, left: 0, right: 100, width: 100, x: 0, y: top, toJSON: () => ({}),
}) as DOMRect

async function renderReader(html = CHAPTER, san = 'Qxf7#') {
  h.html = html
  const view = render(<BookReader />, { wrapper })
  await waitFor(() => expect(view.container.querySelector(`span[data-san="${san}"]`)).not.toBeNull())
  return view
}

function busyLabels() {
  const labels: string[] = []
  const unsub = useBusyStore.subscribe((s) => s.tasks.forEach((t) => labels.push(t.label)))
  return { labels, unsub }
}

describe('every game lives in its own container (S6)', () => {
  it('wraps each game from its start marker to its end marker', async () => {
    const { container } = await renderReader()
    const boxes = [...content(container).querySelectorAll<HTMLElement>('[data-game-container]')]
    expect(boxes.map((b) => b.dataset.gameContainer)).toEqual(['0', '1'])
    const [first, second] = boxes
    expect(first.firstElementChild?.getAttribute('data-game-marker')).toBe('start')
    expect(first.lastElementChild?.getAttribute('data-game-marker')).toBe('end')
    expect(first.textContent).toContain('A wild queen sortie.')
    expect(first.querySelector('span[data-san="Qxf7#"]')).not.toBeNull()
    expect(first.textContent).not.toContain('Intro of the chapter.')
    expect(second.querySelector('span[data-san="c4"]')).not.toBeNull()
  })
})

describe('the layout switch and comment-again run under a spinner, keep the place and flash the game (S6)', () => {
  it('the per-game ¶/{ } switch shows the spinner, then flashes that game', async () => {
    const { container } = await renderReader()
    const { labels, unsub } = busyLabels()
    fireEvent.click(content(container).querySelector('[data-layout-toggle="0"]')!)
    await waitFor(() => expect(content(container).querySelector('[data-game-container="0"]')?.classList.contains('flash-update')).toBe(true))
    unsub()
    expect(labels).toContain('Switching the comment layout')
    expect(content(container).querySelector('[data-game-container="1"]')?.classList.contains('flash-update')).toBe(false)
  })

  it('the top bar ¶/{ } switch shows the spinner too', async () => {
    await renderReader()
    const { labels, unsub } = busyLabels()
    fireEvent.click(within(screen.getByRole('navigation')).getByRole('button', { name: /show the comments (as paragraphs|in braces)/i }))
    await waitFor(() => expect(labels).toContain('Switching the comment layout'))
    unsub()
  })

  it('comment again and restore flash the game and keep it where it was on screen', async () => {
    recommentGame.mockResolvedValue('1. e4 e5\nA new remark.\n2. Qh5 Nc6 3. Bc4 Nf6 4. Qxf7#')
    const { container } = await renderReader()
    const main = container.querySelector('main') as HTMLElement
    let gameTop = 120
    vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (this: Element) {
      if (this === main) return rect(0, 600)
      // Its top on screen moves up as the pane scrolls down (from 500).
      if (this.matches('[data-game-container="0"]')) return rect(gameTop - (main.scrollTop - 500), 300)
      return rect(0, 0)
    })
    main.scrollTop = 500
    const { labels, unsub } = busyLabels()
    fireEvent.click(content(container).querySelector('[data-recomment="0"]')!)
    gameTop = 400 // the new text pushed the game down: the reader must not see it jump
    await waitFor(() => expect(content(container).textContent).toContain('A new remark.'))
    await waitFor(() => expect(content(container).querySelector('[data-game-container="0"]')?.classList.contains('flash-update')).toBe(true))
    unsub()
    expect(labels).toContain('Commenting the game again')
    expect(main.scrollTop).toBe(500 + 280)

    // Restoring the book's text: under the spinner too.
    const again = busyLabels()
    fireEvent.click(content(container).querySelector('[data-recomment="0"]')!)
    await waitFor(() => expect(content(container).textContent).toContain('A wild queen sortie.'))
    again.unsub()
    expect(again.labels).toContain('Restoring the book\'s text')
  })
})

describe('changing the column width keeps the first visible line (S10)', () => {
  it('scrolls so the line that was at the top stays at the top after the reflow', async () => {
    const { container } = await renderReader()
    const main = container.querySelector('main') as HTMLElement
    const target = [...content(container).querySelectorAll('p')].find((p) => p.textContent === 'A wild queen sortie.')!
    const column = container.querySelector('[data-testid="reader-column"]') as HTMLElement
    vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (this: Element) {
      if (this === main) return rect(0, 600)
      // jsdom does not reflow: the narrower column makes the paragraph taller and lower.
      if (this === target) return column.style.maxWidth === '500px' ? rect(200, 80) : rect(-10, 40)
      return rect(-100, 10) // everything else is above the top edge
    })
    main.scrollTop = 900
    fireEvent.click(screen.getByRole('button', { name: 'Reading width' }))
    fireEvent.change(screen.getByRole('slider', { name: 'Text column width' }), { target: { value: '500' } })
    // 10 px of 40 (25 %) were above the top edge: the same line (20 px of 80) is brought back there.
    expect(main.scrollTop).toBe(900 + 200 + 20)
  })
})

describe('study tools in the reader top bar (S7)', () => {
  it('shows the trainer, guess and save icons in the top bar', async () => {
    await renderReader()
    const nav = screen.getByRole('navigation')
    expect(nav.contains(screen.getByRole('button', { name: 'Open the position trainer' }))).toBe(true)
    expect(nav.contains(screen.getByRole('button', { name: 'Guess the next moves' }))).toBe(true)
    expect(nav.contains(screen.getByRole('button', { name: 'Save the line from this move to the trainer' }))).toBe(true)
  })
})
