import { describe, it, expect, vi, afterEach } from 'vitest'
import { lichessStudiesBy, lichessMastersByOpening, chessComGames, chessComArchives, lichessBroadcasts, OPENINGS } from './sources'

function mockFetch(body: string, ok = true) {
  const fn = vi.fn(async (...args: [string, unknown?]) => ({ url: args[0], ok, status: ok ? 200 : 404, text: async () => body, json: async () => JSON.parse(body) }))
  vi.stubGlobal('fetch', fn)
  return fn
}
afterEach(() => vi.unstubAllGlobals())

describe('game sources', () => {
  it('lists the studies of a Lichess author (ndjson)', async () => {
    const f = mockFetch('{"id":"a1","name":"FIDE Candidates | Annotations","updatedAt":2}\n{"id":"b2","name":"Puzzle Pack","updatedAt":1}\n')
    const studies = await lichessStudiesBy('Lichess ')
    expect(f.mock.calls[0][0]).toBe('https://lichess.org/api/study/by/lichess')
    expect(studies).toEqual([
      { id: 'a1', name: 'FIDE Candidates | Annotations', updatedAt: 2 },
      { id: 'b2', name: 'Puzzle Pack', updatedAt: 1 },
    ])
  })

  it('reports an unknown author as an error', async () => {
    mockFetch('', false)
    await expect(lichessStudiesBy('nobody')).rejects.toThrow(/404/)
  })

  it('asks the masters explorer for the top games of an opening', async () => {
    const f = mockFetch(JSON.stringify({
      opening: { eco: 'C50', name: 'Italian Game' },
      topGames: [{ id: 'g1', winner: 'white', year: 1997, white: { name: 'Kasparov, G', rating: 2800 }, black: { name: 'Anand, V', rating: 2780 } }],
    }))
    const italian = OPENINGS.find((o) => o.id === 'italian')!
    const res = await lichessMastersByOpening(italian)
    expect(String(f.mock.calls[0][0])).toContain('explorer.lichess.ovh/masters?play=e2e4,e7e5,g1f3,b8c6,f1c4')
    expect(res).toEqual([{ id: 'g1', white: 'Kasparov, G', black: 'Anand, V', year: 1997, result: '1-0', whiteRating: 2800, blackRating: 2780 }])
  })

  it('lists broadcasts matching a query', async () => {
    mockFetch(JSON.stringify({ currentPageResults: [{ tour: { id: 't1', name: 'Candidates 2026', slug: 'candidates-2026' } }] }))
    expect(await lichessBroadcasts('candidates')).toEqual([
      { id: 't1', name: 'Candidates 2026', url: 'https://lichess.org/broadcast/candidates-2026/t1' },
    ])
  })

  it('reads a chess.com player archive, newest month first, and its games', async () => {
    mockFetch(JSON.stringify({ archives: ['https://api.chess.com/pub/player/x/games/2024/01', 'https://api.chess.com/pub/player/x/games/2024/02'] }))
    expect(await chessComArchives('X')).toEqual([
      { url: 'https://api.chess.com/pub/player/x/games/2024/02', label: '2024/02' },
      { url: 'https://api.chess.com/pub/player/x/games/2024/01', label: '2024/01' },
    ])
    mockFetch(JSON.stringify({ games: [{ url: 'u', pgn: '1. e4 e5 *', white: { username: 'x' }, black: { username: 'y' }, rules: 'chess' }, { rules: 'chess960', pgn: 'p', white: { username: 'a' }, black: { username: 'b' } }] }))
    expect(await chessComGames('https://api.chess.com/pub/player/x/games/2024/02')).toEqual([
      { url: 'u', pgn: '1. e4 e5 *', white: 'x', black: 'y' },
    ])
  })
})

describe('opening database', () => {
  it('asks the explorer for the deepest position it has a name for', async () => {
    const urls: string[] = []
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      urls.push(String(url))
      const plies = String(url).split('play=')[1].split('&')[0].split(',').length
      return new Response(JSON.stringify({ opening: plies <= 4 ? { eco: 'C44', name: "King's Knight Opening" } : null }), { status: 200 })
    }))
    const { lichessOpening } = await import('./sources')
    const uci = ['e2e4', 'e7e5', 'g1f3', 'b8c6', 'a2a3', 'a7a6', 'h2h3', 'h7h6', 'b2b3', 'b7b6']
    expect(await lichessOpening(uci)).toEqual({ eco: 'C44', name: "King's Knight Opening" })
    expect(urls.map((u) => u.split('play=')[1].split('&')[0].split(',').length)).toEqual([10, 8, 6, 4])
    vi.unstubAllGlobals()
  })
  it('gives null when the service fails or knows nothing', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('x', { status: 500 })))
    const { lichessOpening } = await import('./sources')
    expect(await lichessOpening(['a2a3'])).toBeNull()
    vi.unstubAllGlobals()
  })
})
