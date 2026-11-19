import { beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import DatabasePage from './DatabasePage'
import * as res from './resources'
import * as inBook from './openInBook'
import * as busy from '../../shared/layout/busyStore'
import { useExternalBookStore } from '../../shared/externalBook/externalBookStore'
import { useSettingsStore } from '../../shared/settings/settingsStore'
import { isVisited, resetVisited } from '../../shared/visited/visitedStore'

beforeEach(() => {
  useSettingsStore.setState({ language: 'en', commentDbUrl: 'https://api.github.com/repos/me/chessreader-resources/contents', commentDbToken: 'ghp_test' })
  vi.spyOn(res, 'loadBooks').mockResolvedValue([{ id: 'k3', title: 'Mis geniales predecesores III', author: 'Garry Kasparov', lang: 'es', cover: null, thumb: 'data:image/jpeg;base64,xx', games: 89, topPlayers: [{ name: 'Petrosian', games: 27 }, { name: 'Spassky', games: 25 }], period: [1958, 1981] }])
  vi.spyOn(res, 'loadGames').mockResolvedValue([{ id: 'k3-1', book: 'k3', white: 'Petrosian', black: 'Spassky', year: 1966, opening: "Queen's Gambit", result: '1-0', moves: 40, first: 'd4' }])
  vi.spyOn(res, 'loadRatings').mockResolvedValue({ engine: 'Stockfish depth 8', maia: 'Maia 1900', players: [{ player: 'Petrosian', names: ['T. Petrosian'], games: 27, accuracy: 91.2, engineAgreement: 55.1, maiaAgreement: 48.3, nearPerfect: [{ game: 'k3-1', accuracy: 97.4, color: 'white', white: 'Petrosian', black: 'Spassky', year: 1966, book: 'k3' }] }] })
  vi.spyOn(res, 'wikipediaSummary').mockResolvedValue(null)
})

describe('Database (S15, S21, S22)', () => {
  it('shows the books as cards with cover, games, players and period', async () => {
    render(<MemoryRouter><DatabasePage /></MemoryRouter>)
    const card = await screen.findByText('Mis geniales predecesores III')
    expect(card.closest('li')).toHaveTextContent('89 games · mostly 1958–1981')
    expect(card.closest('li')).toHaveTextContent('Petrosian (27), Spassky (25)')
  })
  it('ranks the players by the engines and lists their near-perfect games', async () => {
    render(<MemoryRouter><DatabasePage /></MemoryRouter>)
    fireEvent.click(screen.getByRole('tab', { name: 'Players' }))
    const cell = await screen.findByText('Petrosian', { selector: 'td' })
    expect(cell.closest('tr')).toHaveTextContent('91.2%55.1%48.3%1')
    fireEvent.click(cell)
    await waitFor(() => expect(screen.getByText(/Near-perfect games/)).toBeTruthy())
    expect(screen.getByText(/Petrosian – Spassky · 1966 · 97.4%/)).toBeTruthy()
  })
  it('statistics: tables of players, decades, first moves and openings', async () => {
    render(<MemoryRouter><DatabasePage /></MemoryRouter>)
    fireEvent.click(screen.getByRole('tab', { name: 'Statistics' }))
    await waitFor(() => expect(screen.getByRole('table', { name: 'Players with most games' })).toHaveTextContent('Petrosian'))
    expect(screen.getByRole('table', { name: 'Games per decade' })).toHaveTextContent('1960s')
    expect(screen.getByRole('table', { name: "First moves (White's score)" })).toHaveTextContent('d4')
    expect(screen.getByRole('table', { name: 'Openings' })).toHaveTextContent("Queen's Gambit")
  })
})

const two = () => {
  vi.spyOn(res, 'loadGames').mockResolvedValue([
    { id: 'k3-1', book: 'k3', white: 'T. Petrosian', black: 'B. Spassky', year: 1966, opening: "Queen's Gambit", result: '1-0', moves: 40, first: 'd4', place: 'Moscú', event: 'Moscú 1966 · Campeonato Mundial', date: '1966-04-12', whiteElo: 2650, blackElo: 2620, termination: 'resignation' },
    { id: 'k3-2', book: 'k3', white: 'M. Tal', black: 'M. Botvinnik', year: 1960, opening: 'French Defence', result: '½-½', moves: 31, first: 'e4', place: 'Moscú', event: null, date: null, whiteElo: null, blackElo: null, termination: 'perpetual check' },
  ])
}
const stats = async () => {
  render(<MemoryRouter><DatabasePage /></MemoryRouter>)
  fireEvent.click(screen.getByRole('tab', { name: 'Statistics' }))
  await screen.findByRole('table', { name: 'Players with most games' })
}

describe('Database: sortable players, game facts, statistics links and charts (S2, S3, S4, S16)', () => {
  beforeEach(() => {
    try { localStorage.clear() } catch { /* no storage */ }
    vi.spyOn(res, 'loadRatings').mockResolvedValue({ engine: 'Stockfish', maia: null, players: [
      { player: 'Petrosian', names: ['T. Petrosian'], games: 27, accuracy: 91.2, engineAgreement: 55.1, maiaAgreement: 48.3, nearPerfect: [{ game: 'k3-1', accuracy: 97.4, color: 'white', white: 'Petrosian', black: 'Spassky', year: 1966, book: 'k3' }] },
      { player: 'Spassky', names: ['B. Spassky'], games: 30, accuracy: 88, engineAgreement: 60.2, maiaAgreement: null, nearPerfect: [] },
    ] })
    two()
  })

  it('S2: every column of the players ranking sorts, and a second click reverses', async () => {
    render(<MemoryRouter><DatabasePage /></MemoryRouter>)
    fireEvent.click(screen.getByRole('tab', { name: 'Players' }))
    await screen.findByText('Petrosian', { selector: 'td' })
    const firstPlayer = () => screen.getAllByRole('row')[1].querySelectorAll('td')[1].textContent
    expect(firstPlayer()).toBe('Petrosian')
    fireEvent.click(screen.getByRole('button', { name: /^Games/ }))
    expect(screen.getByRole('columnheader', { name: /^Games/ })).toHaveAttribute('aria-sort', 'descending')
    expect(firstPlayer()).toBe('Spassky')
    fireEvent.click(screen.getByRole('button', { name: /^Games/ }))
    expect(screen.getByRole('columnheader', { name: /^Games/ })).toHaveAttribute('aria-sort', 'ascending')
    expect(firstPlayer()).toBe('Petrosian')
    fireEvent.click(screen.getByRole('button', { name: /^Player/ }))
    expect(screen.getByRole('columnheader', { name: /^Player/ })).toHaveAttribute('aria-sort', 'ascending')
    expect(screen.getByRole('columnheader', { name: /^Games/ })).toHaveAttribute('aria-sort', 'none')
    for (const name of ['#', 'Accuracy', '= Stockfish', '= Maia', 'Near-perfect']) expect(screen.getByRole('button', { name: new RegExp(`^${name.replace(/[#=]/g, '\\$&')}`) })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /^= Maia/ }))
    expect(firstPlayer()).toBe('Petrosian')
  })

  it('S3: game lists show moves, how it ended, Elo, place and event', async () => {
    vi.spyOn(res, 'loadBookGames').mockResolvedValue([{ id: 'k3-1', white: 'T. Petrosian', black: 'B. Spassky', year: 1966, opening: "Queen's Gambit", result: '1-0', moves: 40, first: 'd4', event: 'Moscú 1966 · Campeonato Mundial', place: 'Moscú', date: null, whiteElo: 2650, blackElo: 2620, termination: 'resignation', pgn: '1. d4 d5 1-0' }])
    render(<MemoryRouter><DatabasePage /></MemoryRouter>)
    fireEvent.click(screen.getByRole('tab', { name: 'Search' }))
    const row = (await screen.findByText(/T\. Petrosian – B\. Spassky/)).closest('li')!
    expect(row).toHaveTextContent('40 moves')
    expect(row).toHaveTextContent('1-0 (resignation)')
    expect(row).toHaveTextContent('Elo 2650–2620')
    expect(row).toHaveTextContent('Moscú 1966 · Campeonato Mundial')
    const tal = screen.getByText(/M\. Tal – M\. Botvinnik/).closest('li')!
    expect(tal).toHaveTextContent('½-½ (perpetual check)')
    expect(tal).toHaveTextContent('Moscú')
    expect(tal).not.toHaveTextContent('Elo')
    fireEvent.click(screen.getByRole('tab', { name: 'Books' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Games of Mis geniales predecesores III' }))
    const bookRow = (await screen.findByText(/T\. Petrosian – B\. Spassky/)).closest('li')!
    expect(bookRow).toHaveTextContent('1-0 (resignation)')
    fireEvent.click(screen.getByRole('button', { name: '← Books' }))
    fireEvent.click(screen.getByRole('tab', { name: 'Players' }))
    fireEvent.click(await screen.findByText('Petrosian', { selector: 'td' }))
    const near = (await screen.findByText(/Petrosian – Spassky · 1966 · 97.4%/)).closest('li')!
    expect(near).toHaveTextContent('40 moves')
    expect(near).toHaveTextContent('1-0 (resignation)')
  })

  it('S4: statistics items link to their games in the search results', async () => {
    await stats()
    fireEvent.click(screen.getByRole('button', { name: 'Games of Tal' }))
    expect(screen.getByRole('tab', { name: 'Search' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByText(/Player: Tal/)).toBeTruthy()
    expect(screen.getByText(/M\. Tal – M\. Botvinnik/)).toBeTruthy()
    expect(screen.queryByText(/T\. Petrosian – B\. Spassky/)).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Clear filter' }))
    expect(screen.getByText(/T\. Petrosian – B\. Spassky/)).toBeTruthy()
    for (const [name, shown] of [['Games of the 1960s', /M\. Tal/], ['Games of the first move d4', /T\. Petrosian/], ['Games of the opening French Defence', /M\. Tal/]] as const) {
      fireEvent.click(screen.getByRole('tab', { name: 'Statistics' }))
      fireEvent.click(screen.getByRole('button', { name }))
      expect(screen.getByText(shown)).toBeTruthy()
    }
    expect(screen.queryByText(/T\. Petrosian – B\. Spassky/)).toBeNull()
  })

  it('S4: each statistics table can show a bar or pie chart above it, off by default and remembered', async () => {
    await stats()
    expect(screen.queryByRole('img', { name: /Games per decade/ })).toBeNull()
    const pick = screen.getByRole('combobox', { name: 'Chart for Games per decade' })
    fireEvent.change(pick, { target: { value: 'bar' } })
    expect(screen.getByRole('img', { name: 'Games per decade' })).toHaveTextContent('1960s')
    fireEvent.change(pick, { target: { value: 'pie' } })
    const pie = screen.getByRole('img', { name: 'Games per decade (pie chart)' })
    expect(pie.querySelectorAll('path, circle').length).toBeGreaterThan(0)
    expect(screen.queryByRole('img', { name: /Openings/ })).toBeNull()
    cleanup()
    await stats()
    expect(screen.getByRole('combobox', { name: 'Chart for Games per decade' })).toHaveValue('pie')
    expect(screen.getByRole('img', { name: 'Games per decade (pie chart)' })).toBeTruthy()
  })

  it('S16: book covers are shown whole, without distortion', async () => {
    render(<MemoryRouter><DatabasePage /></MemoryRouter>)
    const card = (await screen.findByText('Mis geniales predecesores III')).closest('li')!
    const img = card.querySelector('img')!
    expect(img.className).toContain('object-contain')
    expect(img.className).not.toContain('object-cover')
  })
})

describe('Database: where each game comes from, the commented game and the book (S1, S2, S3)', () => {
  const petrosian = { id: 'k3-1', white: 'T. Petrosian', black: 'B. Spassky', year: 1966, opening: "Queen's Gambit", result: '1-0', moves: 40, first: 'd4', chapter: 4, gameIndex: 2 }
  beforeEach(() => {
    vi.spyOn(res, 'loadGames').mockResolvedValue([
      { ...petrosian, book: 'k3' },
      { id: 'li-1', book: 'lichess', source: 'lichess', white: 'M. Carlsen', black: 'H. Nakamura', year: 2020, opening: 'Sicilian Defence', result: '½-½', moves: 30, first: 'e4' },
    ])
    vi.spyOn(res, 'loadBookGames').mockResolvedValue([{ ...petrosian, pgn: '1. d4 d5 1-0', commented: '1. d4 {Una apertura cerrada.} 1... d5 1-0' }])
  })
  const page = () => render(
    <MemoryRouter>
      <Routes>
        <Route path="/" element={<DatabasePage />} />
        <Route path="/read/:id" element={<p>Reader open</p>} />
      </Routes>
    </MemoryRouter>,
  )
  const searchRow = async (players: RegExp) => {
    fireEvent.click(screen.getByRole('tab', { name: 'Search' }))
    return (await screen.findByText(players)).closest('li')!
  }

  it('S1: every game list shows the book it comes from, linking to its games, or Lichess', async () => {
    page()
    await screen.findByText('Mis geniales predecesores III')
    const row = await searchRow(/T\. Petrosian – B\. Spassky/)
    expect(row).toHaveTextContent('Mis geniales predecesores III')
    const lichess = screen.getByText(/M\. Carlsen – H\. Nakamura/).closest('li')!
    expect(lichess).toHaveTextContent('Lichess')
    fireEvent.click(screen.getByRole('tab', { name: 'Players' }))
    fireEvent.click(await screen.findByText('Petrosian', { selector: 'td' }))
    const near = (await screen.findByText(/Petrosian – Spassky · 1966 · 97.4%/)).closest('li')!
    expect(near).toHaveTextContent('Mis geniales predecesores III')
  })

  it('the book link of a game opens the book at that game', async () => {
    const spy = vi.spyOn(inBook, 'openGameInBook').mockResolvedValue('/read/-1')
    page()
    await screen.findByText('Mis geniales predecesores III')
    await searchRow(/T\. Petrosian – B\. Spassky/)
    fireEvent.click(screen.getAllByRole('button', { name: 'Book: Mis geniales predecesores III' })[0])
    await screen.findByText('Reader open')
    expect(spy).toHaveBeenCalledWith(expect.objectContaining({ id: 'k3' }), { chapter: 4, gameIndex: 2 })
  })

  it('S2 S3: Open shows the game with the book\'s remarks, with a spinner while it opens', async () => {
    const spy = vi.spyOn(busy, 'withBusy')
    page()
    await screen.findByText('Mis geniales predecesores III')
    await searchRow(/T\. Petrosian – B\. Spassky/)
    fireEvent.click(screen.getByRole('button', { name: 'Open T. Petrosian – B. Spassky' }))
    await screen.findByText('Reader open')
    expect(spy).toHaveBeenCalledWith('Opening the commented game', expect.any(Function))
    expect(useExternalBookStore.getState().chapters[0].html).toContain('Una apertura cerrada.')
  })

  it('a book fragment that starts from a position opens from that position', async () => {
    const fen = '5rk1/1pp5/r5bp/p1nPp1q1/2P2p2/2N5/PP1QBRPP/5R1K w - - 0 26'
    vi.spyOn(res, 'loadBookGames').mockResolvedValue([{ ...petrosian, fen, pgn: '26. g3 Ne4 *', commented: '26. g3 {Un buen plan.} 26... Ne4 *' }])
    page()
    await screen.findByText('Mis geniales predecesores III')
    await searchRow(/T\. Petrosian – B\. Spassky/)
    fireEvent.click(screen.getByRole('button', { name: 'Open T. Petrosian – B. Spassky' }))
    await screen.findByText('Reader open')
    expect(useExternalBookStore.getState().chapters[0].html).toContain(`<p>${fen}</p>`)
  })

  it('S2 S3: Open in the book opens the book at its chapter and game, with a spinner', async () => {
    const spy = vi.spyOn(busy, 'withBusy')
    const open = vi.spyOn(inBook, 'openGameInBook').mockResolvedValue('/read/7')
    page()
    await screen.findByText('Mis geniales predecesores III')
    await searchRow(/T\. Petrosian – B\. Spassky/)
    expect(screen.queryByRole('button', { name: 'Open M. Carlsen – H. Nakamura in the book' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Open T. Petrosian – B. Spassky in the book' }))
    await screen.findByText('Reader open')
    expect(spy).toHaveBeenCalledWith('Opening the book', expect.any(Function))
    expect(open).toHaveBeenCalledWith(expect.objectContaining({ id: 'k3', title: 'Mis geniales predecesores III' }), { chapter: 4, gameIndex: 2 })
  })
})

describe('Database: reference, source and opened marks of the games (reader-analysis S6, S8, S9)', () => {
  const tal = { id: 'k3-7', white: 'M. Tal', black: 'M. Botvinnik', year: 1960, opening: 'French Defence', result: '½-½', moves: 31, first: 'e4', chapter: 2, gameIndex: 1 }
  beforeEach(() => {
    try { localStorage.clear() } catch { /* no storage */ }
    resetVisited()
    vi.spyOn(res, 'loadGames').mockResolvedValue([
      { ...tal, book: 'k3' },
      { id: 'lichess-AbCd1234', book: 'lichess', source: 'lichess', white: 'M. Carlsen', black: 'H. Nakamura', year: 2020, opening: 'Sicilian Defence', result: '½-½', moves: 30, first: 'e4' },
    ])
    vi.spyOn(res, 'loadBookGames').mockImplementation(async (id) => (id === 'lichess'
      ? [{ id: 'lichess-AbCd1234', white: 'M. Carlsen', black: 'H. Nakamura', year: 2020, opening: 'Sicilian Defence', result: '½-½', moves: 30, first: 'e4', pgn: '1. e4 c5 ½-½' }]
      : [{ ...tal, pgn: '1. e4 e6 ½-½', commented: '1. e4 {Tal.} 1... e6 ½-½' }]))
  })
  const page = (path = '/') => render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/" element={<DatabasePage />} />
        <Route path="/database" element={<DatabasePage />} />
        <Route path="/read/:id" element={<p>Reader open</p>} />
      </Routes>
    </MemoryRouter>,
  )
  const openRow = async (players: RegExp, name: string) => {
    fireEvent.click(screen.getByRole('tab', { name: 'Search' }))
    await screen.findByText(players)
    fireEvent.click(screen.getByRole('button', { name }))
    await screen.findByText('Reader open')
  }

  it('S6: an opened book game is headed by the game, its book and its database id', async () => {
    page()
    await screen.findByText('Mis geniales predecesores III')
    await openRow(/M\. Tal – M\. Botvinnik/, 'Open M. Tal – M. Botvinnik')
    const { title, chapters } = useExternalBookStore.getState()
    // The reader's top bar shows "<book title> · <chapter title>".
    expect(`${title} · ${chapters[0].title}`).toBe('M. Tal – M. Botvinnik (1960) · Mis geniales predecesores III · #k3-7')
    expect(chapters[0].html).toContain('M. Tal – M. Botvinnik (1960) · Mis geniales predecesores III</h2>')
    expect(chapters[0].html).toMatch(/Database id: <code[^>]*>k3-7<\/code>/)
    // Still the book's remarks.
    expect(chapters[0].html).toContain('{Tal.}')
  })

  it('S8: at the end, the author and book with a link that opens the game in the book', async () => {
    const spy = vi.spyOn(inBook, 'openGameInBook').mockResolvedValue('/read/-1')
    page()
    await screen.findByText('Mis geniales predecesores III')
    await openRow(/M\. Tal – M\. Botvinnik/, 'Open M. Tal – M. Botvinnik')
    const html = useExternalBookStore.getState().chapters[0].html
    expect(html).toContain('Source: Garry Kasparov, <cite>Mis geniales predecesores III</cite>')
    expect(html.indexOf('{Tal.}')).toBeLessThan(html.indexOf('class="game-source"'))
    cleanup()
    // The reader shows that html; the database (kept mounted) opens the book on a click of its link.
    page()
    await screen.findByText('Mis geniales predecesores III')
    const host = document.createElement('div')
    host.innerHTML = html
    document.body.appendChild(host)
    fireEvent.click(host.querySelector('a.open-game-in-book')!)
    await screen.findByText('Reader open')
    expect(spy).toHaveBeenCalledWith(expect.objectContaining({ id: 'k3' }), { chapter: 2, gameIndex: 1 })
    host.remove()
  })

  it('S8: the link also works after a refresh (the database route opens the book)', async () => {
    const spy = vi.spyOn(inBook, 'openGameInBook').mockResolvedValue('/read/-1')
    page('/database?openBook=k3&chapter=2&game=1')
    await screen.findByText('Reader open')
    expect(spy).toHaveBeenCalledWith(expect.objectContaining({ id: 'k3' }), { chapter: 2, gameIndex: 1 })
  })

  it('S8: a Lichess game ends with Lichess and a link to the game there', async () => {
    page()
    await screen.findByText('Mis geniales predecesores III')
    await openRow(/M\. Carlsen – H\. Nakamura/, 'Open M. Carlsen – H. Nakamura')
    const { chapters } = useExternalBookStore.getState()
    expect(chapters[0].title).toBe('Lichess · #lichess-AbCd1234')
    expect(chapters[0].html).toContain('Source: Lichess')
    expect(chapters[0].html).toContain('href="https://lichess.org/AbCd1234"')
  })

  it('S9: a game already opened is marked in the lists, and so is a book opened at a game', async () => {
    vi.spyOn(inBook, 'openGameInBook').mockResolvedValue('/read/-1')
    page()
    await screen.findByText('Mis geniales predecesores III')
    fireEvent.click(screen.getByRole('tab', { name: 'Search' }))
    const row = (await screen.findByText(/M\. Tal – M\. Botvinnik/)).closest('li')!
    expect(row).not.toHaveAttribute('data-visited')
    expect(screen.queryByLabelText('Already opened')).toBeNull()
    await openRow(/M\. Tal – M\. Botvinnik/, 'Open M. Tal – M. Botvinnik')
    expect(isVisited('game', 'k3-7')).toBe(true)
    cleanup()
    page()
    await screen.findByText('Mis geniales predecesores III')
    fireEvent.click(screen.getByRole('tab', { name: 'Search' }))
    const opened = (await screen.findByText(/M\. Tal – M\. Botvinnik/)).closest('li')!
    expect(opened).toHaveAttribute('data-visited')
    expect(opened.querySelector('[aria-label="Already opened"]')).not.toBeNull()
    const other = screen.getByText(/M\. Carlsen – H\. Nakamura/).closest('li')!
    expect(other).not.toHaveAttribute('data-visited')
    // Open in the book marks the book: its card shows it.
    fireEvent.click(screen.getByRole('button', { name: 'Open M. Tal – M. Botvinnik in the book' }))
    await screen.findByText('Reader open')
    cleanup()
    page()
    const card = (await screen.findByText('Mis geniales predecesores III')).closest('li')!
    expect(card).toHaveAttribute('data-visited')
  })
})
