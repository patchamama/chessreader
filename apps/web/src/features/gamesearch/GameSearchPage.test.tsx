import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import GameSearchPage from './GameSearchPage'
import * as sources from './sources'
import { useExternalBookStore } from '../../shared/externalBook/externalBookStore'

vi.mock('./sources', async (orig) => ({
  ...(await orig<typeof import('./sources')>()),
  lichessStudiesBy: vi.fn(),
  lichessStudyPgn: vi.fn(),
  lichessMastersByOpening: vi.fn(),
  lichessMasterPgn: vi.fn(),
  lichessBroadcasts: vi.fn(),
  chessComArchives: vi.fn(),
  chessComGames: vi.fn(),
}))
const s = vi.mocked(sources)

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/search']}>
      <Routes>
        <Route path="/search" element={<GameSearchPage />} />
        <Route path="/read/:bookId" element={<p>reader open</p>} />
      </Routes>
    </MemoryRouter>,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  useExternalBookStore.setState({ title: '', chapters: [], version: 0 })
})

describe('GameSearchPage', () => {
  it('lists an author\'s annotated studies, filters by topic and opens one in the reader', async () => {
    s.lichessStudiesBy.mockResolvedValue([
      { id: 'a1', name: 'FIDE Candidates 2026 | Annotations', updatedAt: 2 },
      { id: 'b2', name: 'Olympiad | Puzzle Pack', updatedAt: 1 },
    ])
    s.lichessStudyPgn.mockResolvedValue('[Event "x"]\n[White "A"]\n[Black "B"]\n\n1. e4 e5 { good } 2. Nf3 *\n')
    renderPage()
    fireEvent.click(screen.getByRole('button', { name: 'Search studies' }))
    await waitFor(() => expect(screen.getByText('Olympiad | Puzzle Pack')).toBeInTheDocument())
    expect(s.lichessStudiesBy).toHaveBeenCalledWith('lichess')

    fireEvent.click(screen.getByRole('button', { name: 'Annotated games' }))
    expect(screen.queryByText('Olympiad | Puzzle Pack')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Open FIDE Candidates 2026 | Annotations' }))
    await waitFor(() => expect(screen.getByText('reader open')).toBeInTheDocument())
    expect(s.lichessStudyPgn).toHaveBeenCalledWith('a1')
    expect(useExternalBookStore.getState().chapters).toHaveLength(1)
    expect(useExternalBookStore.getState().title).toBe('FIDE Candidates 2026 | Annotations')
  })

  it('finds classic master games by opening and opens one', async () => {
    s.lichessMastersByOpening.mockResolvedValue([{ id: 'g1', white: 'Kasparov, G', black: 'Anand, V', year: 1997, result: '1-0' }])
    s.lichessMasterPgn.mockResolvedValue('[White "Kasparov, G"]\n[Black "Anand, V"]\n\n1. e4 e5 2. Nf3 1-0\n')
    renderPage()
    fireEvent.click(screen.getByRole('tab', { name: 'Master games by opening' }))
    fireEvent.click(screen.getByRole('button', { name: 'Italian Game' }))
    await waitFor(() => expect(screen.getByText(/Kasparov, G — Anand, V/)).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: /Open Kasparov, G — Anand, V/ }))
    await waitFor(() => expect(screen.getByText('reader open')).toBeInTheDocument())
    expect(s.lichessMasterPgn).toHaveBeenCalledWith('g1')
  })

  it('says plainly that chess.com has no annotated-game search and lists a player\'s games', async () => {
    s.chessComArchives.mockResolvedValue([{ url: 'u/2024/02', label: '2024/02' }])
    s.chessComGames.mockResolvedValue([{ url: 'g', pgn: '1. d4 d5 *', white: 'x', black: 'y' }])
    renderPage()
    fireEvent.click(screen.getByRole('tab', { name: 'Chess.com player' }))
    expect(screen.getByText(/no search for annotated games/)).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('Chess.com username'), { target: { value: 'x' } })
    fireEvent.click(screen.getByRole('button', { name: 'Find games' }))
    await waitFor(() => expect(screen.getByText('x — y')).toBeInTheDocument())
    expect(s.chessComGames).toHaveBeenCalledWith('u/2024/02')
  })

  it('shows the error when a source fails', async () => {
    s.lichessStudiesBy.mockRejectedValue(new Error('lichess.org answered 404'))
    renderPage()
    fireEvent.click(screen.getByRole('button', { name: 'Search studies' }))
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('lichess.org answered 404'))
  })

  it('tells when a study has no game to replay from the initial position', async () => {
    s.lichessStudiesBy.mockResolvedValue([{ id: 'b2', name: 'Puzzle Pack', updatedAt: 1 }])
    s.lichessStudyPgn.mockResolvedValue('[Event "p"]\n[FEN "8/8/8/8/8/8/8/K6k w - - 0 1"]\n\n1. Kb1 *\n')
    renderPage()
    fireEvent.click(screen.getByRole('button', { name: 'Search studies' }))
    await waitFor(() => expect(screen.getByText('Puzzle Pack')).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: 'Open Puzzle Pack' }))
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(/no game that starts from the initial position/))
    expect(screen.queryByText('reader open')).not.toBeInTheDocument()
  })
})
