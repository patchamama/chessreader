import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
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
  it('statistics: charts of players, decades, first moves and openings', async () => {
    render(<MemoryRouter><DatabasePage /></MemoryRouter>)
    fireEvent.click(screen.getByRole('tab', { name: 'Statistics' }))
    await waitFor(() => expect(screen.getByRole('img', { name: 'Players with most games' })).toBeTruthy())
    expect(screen.getByRole('img', { name: 'Games per decade' })).toHaveTextContent('1960s')
  })
})
