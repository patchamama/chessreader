import { afterEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { useExternalBookStore } from '../../shared/externalBook/externalBookStore'
import { PuzzlePanel } from './PuzzlePanel'
import { OpenInStudy } from './OpenInStudy'

vi.mock('../../shared/chess/ChessBoard', () => ({ default: ({ fen }: { fen: string }) => <div data-testid="board">{fen}</div> }))

const DAILY = {
  game: { id: 'g1', perf: { name: 'Blitz' }, players: [{ name: 'Ann', color: 'white', rating: 2000 }, { name: 'Bob', color: 'black', rating: 1900 }] },
  puzzle: { id: 'p1', rating: 1500, plays: 10, solution: ['a1a8'], themes: ['mateIn1'], fen: '6k1/5ppp/8/8/8/8/5PPP/R5K1 w - - 0 1', lastMove: 'g7g8', initialPly: 30 },
}
const PGN = '[White "Ann"]\n[Black "Bob"]\n\n1. e4 e5 2. Nf3 Nc6 *'

const inRouter = (ui: React.ReactNode) => render(
  <MemoryRouter><Routes><Route path="/" element={ui} /><Route path="/read/:id" element={<p>reader</p>} /></Routes></MemoryRouter>,
)

describe('Lichess games open in the study too (S7)', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('a puzzle offers its Lichess game in the study, next to the Lichess link', async () => {
    const urls: string[] = []
    vi.stubGlobal('fetch', vi.fn(async (url: string) => { urls.push(url); return new Response(url.includes('/game/export/') ? PGN : JSON.stringify(DAILY)) }))
    inRouter(<PuzzlePanel />)
    fireEvent.click(screen.getByRole('button', { name: 'Puzzle of the day' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Open Ann (2000) – Bob (1900) in the study' }))
    expect(await screen.findByText('reader')).toBeInTheDocument()
    expect(urls.some((u) => u.startsWith('https://lichess.org/game/export/g1'))).toBe(true)
    expect(useExternalBookStore.getState().chapters.length).toBeGreaterThan(0)
  })

  it('says why when the game cannot be read, and renders nothing outside a router', async () => {
    inRouter(<OpenInStudy title="X" load={() => Promise.reject(new Error('lichess.org answered 404'))} />)
    fireEvent.click(screen.getByRole('button', { name: 'Open X in the study' }))
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('lichess.org answered 404'))
  })
})
