import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { useSettingsStore } from '../../shared/settings/settingsStore'
import { MyGamesBrowser } from './MyGamesBrowser'
import { clearGameIndexCache } from './myGamesIndex'

const line = (id: string, createdAt: number, white = 'me') => JSON.stringify({ id, createdAt, status: 'resign', winner: 'black', speed: 'rapid', moves: 'e4 c5', opening: { name: 'Sicilian Defense' },
  players: { white: { user: { name: white }, rating: 1500 }, black: { user: { name: 'bob' }, rating: 1600 } }, pgn: `[Site "${id}"]\n\n1. e4 c5 0-1\n` })

function stubLichess(lines: string[]) {
  vi.stubGlobal('fetch', vi.fn(async (url: string) => url.endsWith('/api/account')
    ? new Response(JSON.stringify({ username: 'me', createdAt: Date.UTC(2020, 0, 1) }), { status: 200 })
    : new Response(lines.map((l) => `${l}\n`).join(''), { status: 200 })))
}

beforeEach(() => { useSettingsStore.setState({ lichessToken: 'tok' }); clearGameIndexCache() })
afterEach(() => { cleanup(); vi.unstubAllGlobals() })

describe('my games browser (S4)', () => {
  it('shows only the years and months that have games, with the number of games in parentheses', async () => {
    stubLichess([line('a', Date.UTC(2024, 2, 3)), line('b', Date.UTC(2024, 2, 9)), line('c', Date.UTC(2024, 10, 1)), line('d', Date.UTC(2022, 5, 1))])
    render(<MyGamesBrowser open={() => {}} />)
    fireEvent.click(screen.getByRole('button', { name: 'Load my games' }))
    const years = await screen.findByRole('list', { name: 'Years' })
    expect(within(years).getAllByRole('button').map((b) => b.textContent)).toEqual(['▸ 2024 (3)', '▸ 2022 (1)'])
    fireEvent.click(screen.getByRole('button', { name: /2024 \(3\)/ }))
    expect(screen.getAllByText(/^(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) 2024/).map((s) => s.textContent)).toEqual(['Nov 2024 (1)', 'Mar 2024 (2)'])
  })

  it('lists every game newest first without the year and month grouping', async () => {
    stubLichess([line('a', Date.UTC(2024, 2, 3), 'old'), line('b', Date.UTC(2026, 0, 9), 'new'), line('c', Date.UTC(2025, 5, 1), 'mid')])
    render(<MyGamesBrowser open={() => {}} />)
    fireEvent.click(screen.getByRole('button', { name: 'Load my games' }))
    await screen.findByRole('list', { name: 'Years' })
    fireEvent.click(screen.getByRole('button', { name: 'All games' }))
    const all = screen.getByRole('list', { name: 'All games' })
    expect(within(all).getAllByRole('button', { name: /^Open / }).map((b) => b.getAttribute('aria-label'))).toEqual(['Open new (1500) – bob (1600)', 'Open mid (1500) – bob (1600)', 'Open old (1500) – bob (1600)'])
    expect(screen.queryByRole('list', { name: 'Years' })).toBeNull()
  })

  it('shows the first page of a long list and more on request', async () => {
    stubLichess(Array.from({ length: 60 }, (_, i) => line(`g${i}`, Date.UTC(2025, 0, 1) + i * 60000)))
    render(<MyGamesBrowser open={() => {}} />)
    fireEvent.click(screen.getByRole('button', { name: 'Load my games' }))
    await screen.findByRole('list', { name: 'Years' })
    fireEvent.click(screen.getByRole('button', { name: 'All games' }))
    expect(within(screen.getByRole('list', { name: 'All games' })).getAllByRole('listitem')).toHaveLength(50)
    fireEvent.click(screen.getByRole('button', { name: 'Show more' }))
    expect(within(screen.getByRole('list', { name: 'All games' })).getAllByRole('listitem')).toHaveLength(60)
    expect(screen.queryByRole('button', { name: 'Show more' })).toBeNull()
  })

  it('a game row still links to the site and opens the game in the reader', async () => {
    stubLichess([line('a', Date.UTC(2024, 2, 3))])
    const open = vi.fn()
    render(<MyGamesBrowser open={open} />)
    fireEvent.click(screen.getByRole('button', { name: 'Load my games' }))
    await screen.findByRole('list', { name: 'Years' })
    fireEvent.click(screen.getByRole('button', { name: 'All games' }))
    expect(screen.getByRole('link', { name: 'me (1500) – bob (1600) on Lichess' }).getAttribute('href')).toBe('https://lichess.org/a')
    fireEvent.click(screen.getByRole('button', { name: 'Open me (1500) – bob (1600)' }))
    await waitFor(() => expect(open).toHaveBeenCalledWith('me (1500) – bob (1600)', '[Site "a"]\n\n1. e4 c5 0-1\n'))
  })
})
