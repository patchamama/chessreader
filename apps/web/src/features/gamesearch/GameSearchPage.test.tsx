import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import GameSearchPage from './GameSearchPage'
import * as sources from './sources'
import { useExternalBookStore } from '../../shared/externalBook/externalBookStore'
import { useSettingsStore } from '../../shared/settings/settingsStore'

vi.mock('./sources', async (orig) => ({
  ...(await orig<typeof import('./sources')>()),
  lichessStudiesBy: vi.fn(),
  lichessStudyPgn: vi.fn(),
  lichessMastersByOpening: vi.fn(),
  lichessMasterPgn: vi.fn(),
  lichessBroadcasts: vi.fn(),
  chessComArchives: vi.fn(),
  chessComGames: vi.fn(),
  cachedLichessEntries: vi.fn(() => []),
  lichessMyGames: vi.fn(),
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
/** The page opens on "Recommended"; the search tests start from the studies tab. */
function renderStudies() {
  const view = renderPage()
  fireEvent.click(screen.getByRole('tab', { name: 'Annotated studies' }))
  return view
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
    renderStudies()
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
    s.lichessMastersByOpening.mockResolvedValue([{ id: 'g1', white: 'Kasparov, G', black: 'Anand, V', year: 1997, result: '1-0', whiteRating: 2795, blackRating: 2765 }])
    s.lichessMasterPgn.mockResolvedValue('[White "Kasparov, G"]\n[Black "Anand, V"]\n\n1. e4 e5 2. Nf3 1-0\n')
    renderPage()
    fireEvent.click(screen.getByRole('tab', { name: 'Master games by opening' }))
    fireEvent.click(screen.getByRole('button', { name: 'Italian Game' }))
    await waitFor(() => expect(screen.getByText(/Kasparov, G — Anand, V/)).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: /Open Kasparov, G — Anand, V/ }))
    await waitFor(() => expect(screen.getByText('reader open')).toBeInTheDocument())
    expect(s.lichessMasterPgn).toHaveBeenCalledWith('g1', undefined)
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
    renderStudies()
    fireEvent.click(screen.getByRole('button', { name: 'Search studies' }))
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('lichess.org answered 404'))
  })

  it('tells when a study has no game to replay from the initial position', async () => {
    s.lichessStudiesBy.mockResolvedValue([{ id: 'b2', name: 'Puzzle Pack', updatedAt: 1 }])
    s.lichessStudyPgn.mockResolvedValue('[Event "p"]\n[FEN "8/8/8/8/8/8/8/K6k w - - 0 1"]\n\n1. Kb1 *\n')
    renderStudies()
    fireEvent.click(screen.getByRole('button', { name: 'Search studies' }))
    await waitFor(() => expect(screen.getByText('Puzzle Pack')).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: 'Open Puzzle Pack' }))
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(/no game that starts from the initial position/))
    expect(screen.queryByText('reader open')).not.toBeInTheDocument()
  })
})

describe('GameSearchPage, recommended', () => {
  it('opens on the recommendations and reads a basic checkmate with its comments', () => {
    renderPage()
    expect(screen.getByRole('tab', { name: 'Recommended' })).toHaveAttribute('aria-selected', 'true')
    fireEvent.click(screen.getByRole('button', { name: "Open Scholar's Mate" }))
    expect(screen.getByText('reader open')).toBeInTheDocument()
    expect(useExternalBookStore.getState().chapters[0].html).toContain('The queen on f7 is protected by the bishop on c4.')
  })

  it('shows traps and classics by category, each with its level', () => {
    renderPage()
    fireEvent.click(screen.getByRole('button', { name: 'Opening traps' }))
    expect(screen.getByText("Noah's Ark Trap")).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Classic games' }))
    expect(screen.getByText('The Immortal Game — Anderssen, 1851')).toBeInTheDocument()
    expect(screen.getAllByText('beginner').length).toBeGreaterThan(0)
  })

  it('an opening of a level lists its top master games, ranked, with a link to Lichess', async () => {
    s.lichessMastersByOpening.mockResolvedValue([{ id: 'g1', white: 'Carlsen, M.', black: 'Caruana, F.', year: 2019, result: '½-½', whiteRating: 2870, blackRating: 2820 }])
    renderPage()
    fireEvent.click(screen.getByRole('button', { name: 'Openings by level' }))
    fireEvent.click(screen.getByRole('button', { name: 'Italian Game' }))
    await waitFor(() => expect(screen.getByText(/Elo 2870–2820/)).toBeInTheDocument())
    expect(screen.getByRole('link', { name: 'Carlsen, M. — Caruana, F. on Lichess' })).toHaveAttribute('href', 'https://lichess.org/import/master/g1/white')
  })

  it('players and books link to the Lichess study search, and a pasted study link opens here', async () => {
    s.lichessStudyPgn.mockResolvedValue('[Event "x"]\n[White "Capablanca"]\n[Black "Marshall"]\n\n1. e4 e5 { good } 2. Nf3 *\n')
    renderPage()
    fireEvent.click(screen.getByRole('button', { name: 'Players and books' }))
    expect(screen.getByRole('link', { name: 'Capablanca ↗' })).toHaveAttribute('href', 'https://lichess.org/study/search?q=Capablanca')
    expect(screen.getByRole('link', { name: 'My System (Nimzowitsch) ↗' })).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('Lichess study link'), { target: { value: 'https://lichess.org/study/AbCd1234/xyz' } })
    fireEvent.click(screen.getByRole('button', { name: 'Open study' }))
    await waitFor(() => expect(screen.getByText('reader open')).toBeInTheDocument())
    expect(s.lichessStudyPgn).toHaveBeenCalledWith('AbCd1234')
  })

  it('a study in the list links to its page on Lichess', async () => {
    s.lichessStudiesBy.mockResolvedValue([{ id: 'a1b2c3d4', name: 'Annotated Games', updatedAt: 2 }])
    renderStudies()
    fireEvent.click(screen.getByRole('button', { name: 'Search studies' }))
    await waitFor(() => expect(screen.getByRole('link', { name: 'Annotated Games on Lichess' })).toHaveAttribute('href', 'https://lichess.org/study/a1b2c3d4'))
  })
})

describe('Lichess token and offline copies', () => {
  it('asks for a personal token when the masters explorer answers 401, then retries with it', async () => {
    useSettingsStore.setState({ lichessToken: '' })
    s.lichessMastersByOpening.mockRejectedValueOnce(new sources.LichessAuthError(false)).mockResolvedValueOnce([])
    renderPage()
    fireEvent.click(screen.getByRole('tab', { name: 'Master games by opening' }))
    fireEvent.click(screen.getByRole('button', { name: 'Italian Game' }))
    const link = await screen.findByRole('link', { name: /create a lichess token/i })
    expect(link.getAttribute('href')).toBe(sources.LICHESS_TOKEN_URL)
    fireEvent.change(screen.getByLabelText('Lichess token'), { target: { value: 'lip_abc' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save token and retry' }))
    await waitFor(() => expect(s.lichessMastersByOpening).toHaveBeenLastCalledWith(expect.objectContaining({ id: 'italian' }), 'lip_abc'))
    expect(useSettingsStore.getState().lichessToken).toBe('lip_abc')
    expect(await screen.findByText('No games found.')).toBeTruthy()
  })

  it('offers the games kept offline when Lichess cannot be reached', async () => {
    s.cachedLichessEntries.mockReturnValue([{ key: 'study:abcdefgh', title: 'Kept study', pgn: '[Event "Kept"]\n\n1. e4 e5 2. Nf3 *', savedAt: 1 }])
    s.lichessStudiesBy.mockRejectedValueOnce(new TypeError('Failed to fetch'))
    renderStudies()
    fireEvent.click(screen.getByRole('button', { name: 'Search studies' }))
    expect(await screen.findByText(/cannot be reached/i)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Open Kept study' }))
    expect(await screen.findByText('reader open')).toBeTruthy()
  })
})

describe('my Lichess games', () => {
  it('lists the games of the token owner and opens one in the reader (to review and comment it)', async () => {
    useSettingsStore.setState({ lichessToken: 'tok' })
    s.lichessMyGames.mockResolvedValue({ username: 'me', games: [{ id: 'g1', white: 'me', black: 'Lichess AI level 1', result: '0-1', opening: 'Sicilian Defense', date: '2026-11-17', pgn: '[White "me"]\n[Black "AI"]\n\n1. e4 c5 0-1\n' }] })
    renderPage()
    fireEvent.click(screen.getByRole('tab', { name: 'My Lichess games' }))
    fireEvent.click(screen.getByRole('button', { name: 'Load my games' }))
    await waitFor(() => expect(screen.getByText(/me — Lichess AI level 1/)).toBeTruthy())
    expect(s.lichessMyGames).toHaveBeenCalledWith('tok')
    fireEvent.click(screen.getByRole('button', { name: 'Open me — Lichess AI level 1' }))
    await waitFor(() => expect(screen.getByText('reader open')).toBeTruthy())
  })
  it('without a token it asks for one, with the link that ticks the permissions', () => {
    useSettingsStore.setState({ lichessToken: '' })
    renderPage()
    fireEvent.click(screen.getByRole('tab', { name: 'My Lichess games' }))
    expect(screen.getByRole('link', { name: /Create a Lichess token/ }).getAttribute('href')).toContain('scopes[]=board:play')
  })
})
