import { afterEach, describe, expect, it, vi } from 'vitest'
import type { MyGame } from './myGames'
import { chessComAllGames, clearGameIndexCache, groupGames, lichessAllGames, loadGameIndex } from './myGamesIndex'

afterEach(() => { vi.unstubAllGlobals(); clearGameIndexCache() })

const game = (id: string, date: string): MyGame => ({ id, source: 'lichess', url: `https://lichess.org/${id}`, date, white: 'a', black: 'b', result: '1-0', ending: 'mate', opening: '', moves: 1, speed: 'blitz', pgn: '' })
const lichessLine = (id: string, createdAt: number) => JSON.stringify({ id, createdAt, status: 'mate', winner: 'white', speed: 'blitz', moves: 'e4 e5', players: { white: { user: { name: 'me' } }, black: { user: { name: 'you' } } }, pgn: `[Site "${id}"]` })

describe('my games index (S4)', () => {
  it('groups games into only the years and months that have games, newest first, with counts', () => {
    const index = groupGames([game('a', '2024-03-02'), game('b', '2026-01-09'), game('c', '2024-03-20'), game('d', '2024-11-01')])
    expect(index.map((y) => [y.year, y.count, y.months.map((m) => [m.month, m.games.length])])).toEqual([
      [2026, 1, [[1, 1]]],
      [2024, 3, [[11, 1], [3, 2]]],
    ])
    expect(index[1].months[1].games.map((g) => g.id)).toEqual(['c', 'a'])
  })

  it('reads every Lichess game in one ndjson export, reporting progress', async () => {
    const body = `${lichessLine('g2', Date.UTC(2026, 0, 9))}\n${lichessLine('g1', Date.UTC(2025, 4, 1))}\n`
    const fetchMock = vi.fn(async () => new Response(body, { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)
    const progress: number[] = []
    const games = await lichessAllGames('tok', 'me', (n) => progress.push(n))
    expect((fetchMock.mock.calls[0] as unknown as [string])[0]).toBe('https://lichess.org/api/games/user/me?pgnInJson=true&opening=true&clocks=false&evals=false')
    expect(games.map((g) => [g.id, g.date, g.white, g.result, g.pgn])).toEqual([['g2', '2026-01-09', 'me', '1-0', '[Site "g2"]'], ['g1', '2025-05-01', 'me', '1-0', '[Site "g1"]']])
    expect(progress.at(-1)).toBe(2)
  })

  it('reads only the chess.com months its archive list names, newest first', async () => {
    const urls: string[] = []
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      urls.push(url)
      if (url.endsWith('/games/archives')) return new Response(JSON.stringify({ archives: ['https://api.chess.com/pub/player/me/games/2024/03', 'https://api.chess.com/pub/player/me/games/2025/07'] }), { status: 200 })
      const [y, m] = url.split('/').slice(-2)
      return new Response(JSON.stringify({ games: [{ url: `https://www.chess.com/game/live/${y}${m}`, pgn: '[White "me"]\n\n1. e4 1-0', end_time: Date.UTC(+y, +m - 1, 5) / 1000, time_class: 'blitz', rules: 'chess',
        white: { username: 'me', rating: 1, result: 'win' }, black: { username: 'you', rating: 1, result: 'resigned' } }] }), { status: 200 })
    }))
    const games = await chessComAllGames('Me', () => {})
    expect(urls).toEqual(['https://api.chess.com/pub/player/me/games/archives', 'https://api.chess.com/pub/player/me/games/2025/07', 'https://api.chess.com/pub/player/me/games/2024/03'])
    expect(games.map((g) => g.date)).toEqual(['2025-07-05', '2024-03-05'])
  })

  it('keeps the index in memory for the session', async () => {
    const fetchMock = vi.fn(async () => new Response(`${lichessLine('g1', Date.UTC(2025, 4, 1))}\n`, { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)
    await loadGameIndex('lichess', 'me', 'tok', () => {})
    const again = await loadGameIndex('lichess', 'me', 'tok', () => {})
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(again[0].count).toBe(1)
  })
})
