import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, waitFor, fireEvent, act, screen, within } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import React from 'react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import BookReader from '../BookReader'
import { useStudyBoardStore } from '../../store/studyBoardStore'

// Reader structure (reader-db-round T3): games are framed in place, the comment
// layout switch rewrites only its game inside the same book and chapter, the
// table of contents lists games, scroll positions are kept per chapter, and
// heading-like paragraphs of the EPUB are shown as headings.

const CHAPTER_1 = `
<p>Introduction to this chapter, written as a normal paragraph of prose that explains things at length.</p>
<p>Partida 149</p>
<p>M. Euwe-R. Réti</p>
<p>Amsterdam 1920, Match, 3ª partida</p>
<p>Defensa Caro-Kann (B10)</p>
<p>1. e4 c6 2. d4 d5 { A solid choice. } 3. Nc3 dxe4 4. Nxe4 Bf5</p>
<p>After the game the author goes on with a long paragraph of general prose, which is not part of it.</p>
`

const CHAPTER_2 = `
<p>Partida 150</p>
<p>J. Capablanca-A. Alekhine</p>
<p>1. d4 d5 2. c4 e6 3. Nc3 Nf6</p>
`

const CHAPTER_3 = `
<style>.titulo { font-size: 1.8em; font-weight: bold; text-align: center; }</style>
<p class="titulo">The Attack</p>
<p style="font-size: 1.4em; font-weight: bold; text-align: center">On the kingside</p>
<p class="h3">Third level</p>
<p>A normal paragraph with 1. e4 e5 2. Nf3 Nc6 in it, which keeps being prose.</p>
`

const CHAPTER_4 = `
<table><tr><td>Elo</td><td><img src="../Images/rating.png" width="62" height="15" alt="rating"></td></tr></table>
<p><img src="../Images/icon.png" width="20" height="20" alt="icon"></p>
<p><img src="../Images/diagram1.png" alt="diagram"></p>
<p>1. e4 e5 2. Nf3 Nc6 3. Bb5 a6</p>
`

const TOC = [
  { order: 1, title: 'Chapter one' },
  { order: 2, title: 'Chapter two' },
  { order: 3, title: 'Chapter three' },
]
const CHAPTERS: Record<number, string> = { 1: CHAPTER_1, 2: CHAPTER_2, 3: CHAPTER_3, 4: CHAPTER_4 }

vi.mock('../../api/libraryApi', () => ({
  useChapter: (_bookId: number, order: number) => ({
    data: { title: `Chapter ${order}`, html: CHAPTERS[order], toc: TOC },
    isLoading: false,
  }),
  useTouchBook: () => ({ mutate: vi.fn(), isPending: false }),
}))

vi.mock('../../../../shared/api/httpClient', () => ({
  httpClient: (url: string) => {
    const m = /chapters\/(\d+)/.exec(url)
    if (!m) return Promise.reject(new Error('not found'))
    const order = Number(m[1])
    return Promise.resolve({ title: `Chapter ${order}`, html: CHAPTERS[order], toc: TOC })
  },
}))

vi.mock('react-chessboard', () => ({ Chessboard: () => <div data-testid="chessboard" /> }))
vi.mock('../../../../shared/stockfish/useStockfishEval', () => ({
  useStockfishEval: () => ({ loading: false, scoreCp: 0, depth: 10 }),
}))

function LocationProbe() {
  return <div data-testid="location">{useLocation().pathname}</div>
}

function wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return (
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={['/read/7']}>
        <Routes>
          <Route path="/read/:bookId" element={<><LocationProbe />{children}</>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  )
}

const scrollIntoView = vi.fn()

beforeEach(() => {
  localStorage.clear()
  useStudyBoardStore.getState().reset()
  scrollIntoView.mockClear()
  Element.prototype.scrollIntoView = scrollIntoView
})
afterEach(() => {
  // @ts-expect-error restore the jsdom default (no matchMedia)
  delete window.matchMedia
})

const content = (c: HTMLElement) => c.querySelector('.epub-content') as HTMLElement
const paragraphTexts = (c: HTMLElement) => [...content(c).querySelectorAll('p')].map((p) => p.textContent?.trim())

async function renderReader() {
  const view = render(<BookReader />, { wrapper })
  await waitFor(() => expect(view.container.querySelector('span[data-san="dxe4"]')).not.toBeNull())
  return view
}

describe('comment layout switch in place (S11)', () => {
  it('rewrites the game inside the same book and chapter, and other chapters stay intact', async () => {
    const { container } = await renderReader()
    fireEvent.click(screen.getByRole('button', { name: 'Game 149: show the comments as paragraphs' }))

    // Still the same book: never replaced with the external book.
    expect(screen.getByTestId('location')).toHaveTextContent('/read/7')
    await waitFor(() => expect(paragraphTexts(container)).toContain('A solid choice.'))
    expect(paragraphTexts(container)).toContain(
      'Introduction to this chapter, written as a normal paragraph of prose that explains things at length.',
    )
    expect(container.querySelector('span[data-san="Bf5"]')).not.toBeNull()

    // Another chapter shows its own content.
    fireEvent.click(screen.getByTitle('Next chapter'))
    await waitFor(() => expect(container.querySelector('span[data-san="Nf6"]')).not.toBeNull())
    expect(content(container)).toHaveTextContent('J. Capablanca-A. Alekhine')

    // Back in chapter 1 the choice is kept, and switching again restores the braces.
    fireEvent.click(screen.getByTitle('Previous chapter'))
    await waitFor(() => expect(paragraphTexts(container)).toContain('A solid choice.'))
    fireEvent.click(screen.getByRole('button', { name: 'Game 149: show the comments in braces' }))
    await waitFor(() => expect(content(container)).toHaveTextContent('{ A solid choice. }'))
    expect(container.querySelector('span[data-san="Bf5"]')).not.toBeNull()
  })
})

describe('layout switch placement (S7)', () => {
  it('sits in the top bar just before the show/hide board option and not on the board', async () => {
    await renderReader()
    const nav = screen.getByRole('navigation')
    const buttons = within(nav).getAllByRole('button')
    const board = buttons.findIndex((b) => b.title === 'Hide study board')
    // The book comments switch sits right before the board button since S4 (reader-errata-round).
    expect(buttons[board - 1]).toHaveAccessibleName('Hide book comments')
    expect(buttons[board - 2]).toHaveAccessibleName('Show the comments as paragraphs')
    const aside = document.querySelector('aside[data-study-pane]') as HTMLElement
    expect(within(aside).queryByRole('button', { name: /show the comments/i })).toBeNull()
  })

  it('puts the per-game switch one line before the first heading line of the game', async () => {
    const { container } = await renderReader()
    const button = screen.getByRole('button', { name: 'Game 149: show the comments as paragraphs' })
    const marker = button.closest('[data-game-marker="start"]') as HTMLElement
    expect(marker).not.toBeNull()
    expect(marker.nextElementSibling).toHaveTextContent('Partida 149')
    // Nothing is injected among the moves any more.
    expect(content(container).querySelector('p [data-layout-toggle]')).toBeNull()
  })

  it('acts on the active game from the top bar', async () => {
    const { container } = await renderReader()
    fireEvent.click(screen.getByRole('button', { name: 'Show the comments as paragraphs' }))
    await waitFor(() => expect(paragraphTexts(container)).toContain('A solid choice.'))
    expect(screen.getByTestId('location')).toHaveTextContent('/read/7')
  })
})

describe('game start and end markers (S15)', () => {
  it('marks where each game starts (heading) and ends (last move)', async () => {
    const { container } = await renderReader()
    const start = content(container).querySelector('[data-game-marker="start"]') as HTMLElement
    const end = content(container).querySelector('[data-game-marker="end"]') as HTMLElement
    expect(start.getAttribute('data-label')).toBe('Game 149 · Euwe – Réti')
    expect(start.nextElementSibling).toHaveTextContent('Partida 149')
    expect(end.previousElementSibling).toHaveTextContent('Bf5')
    expect(end.getAttribute('data-label')).toBe('end')
  })
})

describe('game headings and the Games tab (S9)', () => {
  it('highlights the heading block and gives the game an anchor', async () => {
    const { container } = await renderReader()
    const heading = [...content(container).querySelectorAll('.game-heading-line')].map((p) => p.textContent)
    expect(heading).toEqual(['Partida 149', 'M. Euwe-R. Réti', 'Amsterdam 1920, Match, 3ª partida', 'Defensa Caro-Kann (B10)'])
    expect(container.querySelector('#game-1-0')).not.toBeNull()
  })

  it('lists the games per chapter and navigates to them, switching chapter when needed', async () => {
    const { container } = await renderReader()
    fireEvent.click(screen.getByTitle('Table of contents'))
    const toc = screen.getByRole('complementary', { name: 'Table of contents' })
    fireEvent.click(within(toc).getByRole('tab', { name: 'Games' }))
    const entry = within(toc).getByRole('button', { name: /149 · M\. Euwe – R\. Réti · Defensa Caro-Kann \(B10\)/ })
    fireEvent.click(entry)
    expect(scrollIntoView).toHaveBeenCalled()
    expect(scrollIntoView.mock.contexts.at(-1)).toBe(container.querySelector('#game-1-0'))

    fireEvent.click(within(toc).getByRole('button', { name: /Chapter two/ }))
    const other = await within(toc).findByRole('button', { name: /150 · J\. Capablanca – A\. Alekhine/ })
    scrollIntoView.mockClear()
    fireEvent.click(other)
    await waitFor(() => expect(container.querySelector('#game-2-0')).not.toBeNull())
    await waitFor(() => expect(scrollIntoView.mock.contexts).toContain(container.querySelector('#game-2-0')))
  })
})

describe('table of contents panel (S13)', () => {
  it('stays open when navigating from it', async () => {
    const { container } = await renderReader()
    fireEvent.click(screen.getByTitle('Table of contents'))
    const toc = screen.getByRole('complementary', { name: 'Table of contents' })
    fireEvent.click(within(toc).getByRole('button', { name: 'Chapter two' }))
    await waitFor(() => expect(container.querySelector('span[data-san="Nf6"]')).not.toBeNull())
    expect(screen.getByRole('complementary', { name: 'Table of contents' })).toBeInTheDocument()
  })

  it('is shown from the start on desktop', async () => {
    window.matchMedia = vi.fn().mockImplementation((q: string) => ({
      matches: q.includes('min-width'), media: q, addEventListener: vi.fn(), removeEventListener: vi.fn(),
    }))
    await renderReader()
    expect(screen.getByRole('complementary', { name: 'Table of contents' })).toBeInTheDocument()
  })

  it('has previous/next chapter buttons at the end of the chapter', async () => {
    const { container } = await renderReader()
    const endNav = screen.getByTestId('chapter-end-nav')
    expect(content(container).compareDocumentPosition(endNav) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    fireEvent.click(within(endNav).getByRole('button', { name: /Next chapter/ }))
    await waitFor(() => expect(container.querySelector('span[data-san="Nf6"]')).not.toBeNull())
  })
})

describe('scroll position per chapter (S12)', () => {
  it('goes to the top of a chapter never opened and back to the saved place of one already read', async () => {
    const { container } = await renderReader()
    const main = container.querySelector('main') as HTMLElement
    Object.defineProperty(main, 'scrollTop', { value: 0, writable: true, configurable: true })
    main.scrollTop = 300
    fireEvent.scroll(main)

    fireEvent.click(screen.getByTitle('Next chapter'))
    await waitFor(() => expect(container.querySelector('span[data-san="Nf6"]')).not.toBeNull())
    expect(main.scrollTop).toBe(0)

    fireEvent.click(screen.getByTitle('Previous chapter'))
    await waitFor(() => expect(container.querySelector('span[data-san="dxe4"]')).not.toBeNull())
    await act(async () => {})
    expect(main.scrollTop).toBe(300)
  })
})

describe('EPUB headings (S8)', () => {
  it('shows heading-like paragraphs as headings without breaking the moves', async () => {
    localStorage.setItem('reading-progress-7', JSON.stringify({ chapter: 3, lastOpenedAt: '' }))
    const { container } = render(<BookReader />, { wrapper })
    await waitFor(() => expect(container.querySelector('span[data-san="Nc6"]')).not.toBeNull())
    expect(screen.getByRole('heading', { name: 'The Attack', level: 1 })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'On the kingside', level: 2 })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Third level', level: 3 })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: /A normal paragraph/ })).toBeNull()
  })
})

describe('images in tables and small icons (S14)', () => {
  it('keeps them as plain images instead of diagram widgets', async () => {
    localStorage.setItem('reading-progress-7', JSON.stringify({ chapter: 4, lastOpenedAt: '' }))
    const { container } = render(<BookReader />, { wrapper })
    await waitFor(() => expect(container.querySelector('span[data-san="a6"]')).not.toBeNull())
    await waitFor(() => expect(container.querySelectorAll('[data-diagram-overlay]').length).toBe(1))
    expect(container.querySelector('td img[alt="rating"]')).not.toBeNull()
    expect(container.querySelector('img[alt="icon"]')?.closest('[data-diagram-overlay]')).toBeNull()
  })
})
