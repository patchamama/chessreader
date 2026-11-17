import { afterEach, describe, expect, it, vi } from 'vitest'
import { lichessMasterPgn, lichessMyGames, LICHESS_TOKEN_URL } from './sources'

describe('lichessMasterPgn', () => {
  afterEach(() => vi.unstubAllGlobals())
  it('downloads the game from the masters explorer (explorer.lichess.ovh/masters/pgn/<id>) with the token', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('[White "A"]\n\n1. e4 1-0\n', { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)
    await expect(lichessMasterPgn('dfYKaW8J-test', 'tok')).resolves.toContain('1. e4')
    expect(fetchMock).toHaveBeenCalledWith('https://explorer.lichess.ovh/masters/pgn/dfYKaW8J-test', { headers: { Authorization: 'Bearer tok' } })
  })
})

describe('lichessMyGames', () => {
  afterEach(() => vi.unstubAllGlobals())
  it('finds the account of the token and lists its games, newest first, with their PGN', async () => {
    const line = JSON.stringify({ id: 'icLVdl9f', createdAt: Date.UTC(2026, 10, 17), status: 'resign', winner: 'black', opening: { name: 'Sicilian Defense' },
      players: { white: { user: { name: 'me' } }, black: { aiLevel: 1 } }, pgn: '[White "me"]\n\n1. e4 c5 0-1\n' })
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response('{"username":"me"}', { status: 200 }))
      .mockResolvedValueOnce(new Response(`${line}\n`, { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)
    const r = await lichessMyGames('tok')
    expect(r.username).toBe('me')
    expect(r.games).toEqual([{ id: 'icLVdl9f', white: 'me', black: 'Lichess AI level 1', result: '0-1', opening: 'Sicilian Defense', date: '2026-11-17', pgn: '[White "me"]\n\n1. e4 c5 0-1\n' }])
    expect(fetchMock).toHaveBeenNthCalledWith(2, 'https://lichess.org/api/games/user/me?max=20&pgnInJson=true&opening=true&clocks=false&evals=false', { headers: { Accept: 'application/x-ndjson', Authorization: 'Bearer tok' } })
  })
  it('the token link ticks the permissions for playing too', () => {
    expect(LICHESS_TOKEN_URL).toBe('https://lichess.org/account/oauth/token/create?scopes[]=board:play&scopes[]=challenge:write&scopes[]=study:read&description=Chess+reader')
  })
})
