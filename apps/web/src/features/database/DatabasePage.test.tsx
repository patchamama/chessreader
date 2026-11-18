import { beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import DatabasePage from './DatabasePage'
import * as res from './resources'
import { useSettingsStore } from '../../shared/settings/settingsStore'

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
