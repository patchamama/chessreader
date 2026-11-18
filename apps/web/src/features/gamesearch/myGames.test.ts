import { afterEach, describe, expect, it, vi } from 'vitest'
import { lichessAccount, lichessGamesOfMonth, chessComGamesOfMonth, monthsBetween, moveCount } from './myGames'

afterEach(() => vi.unstubAllGlobals())

describe('my games by month (S12)', () => {
  it('lists the months from the account creation to now, newest first, grouped by year', () => {
    expect(monthsBetween(new Date(Date.UTC(2025, 10, 5)), new Date(Date.UTC(2026, 1, 3)))).toEqual([
      { year: 2026, months: [2, 1] }, { year: 2025, months: [12, 11] },
    ])
  })

  it('counts the moves of a game', () => {
    expect(moveCount('e4 e5 Nf3')).toBe(2)
    expect(moveCount('1. e4 e5 2. Nf3 Nc6 3. Bb5 1-0')).toBe(3)
  })

  it('reads the account behind the Lichess token', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ username: 'mandy', createdAt: Date.UTC(2024, 0, 1) }), { status: 200 })))
    await expect(lichessAccount('tok')).resolves.toEqual({ username: 'mandy', createdAt: Date.UTC(2024, 0, 1) })
  })

  it('reads a month of Lichess games with players, ratings, result, how it ended, opening and moves', async () => {
    const line = JSON.stringify({ id: 'g1', createdAt: Date.UTC(2026, 0, 9), status: 'mate', winner: 'white', speed: 'blitz', moves: 'e4 e5 Qh5 Nc6 Bc4 Nf6 Qxf7#',
      opening: { name: "King's Pawn Game" }, players: { white: { user: { name: 'mandy' }, rating: 1650 }, black: { user: { name: 'bob' }, rating: 1700 } }, pgn: '[White "mandy"]\n\n1. e4 e5 *' })
    const fetchMock = vi.fn(async () => new Response(`${line}\n`, { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)
    const games = await lichessGamesOfMonth('tok', 'mandy', 2026, 1)
    expect((fetchMock.mock.calls[0] as unknown as [string])[0]).toBe(`https://lichess.org/api/games/user/mandy?since=${Date.UTC(2026, 0, 1)}&until=${Date.UTC(2026, 1, 1)}&pgnInJson=true&opening=true&clocks=false&evals=false`)
    expect(games).toEqual([{ id: 'g1', source: 'lichess', url: 'https://lichess.org/g1', date: '2026-01-09', white: 'mandy', black: 'bob', whiteElo: 1650, blackElo: 1700,
      result: '1-0', ending: 'mate', opening: "King's Pawn Game", moves: 4, speed: 'blitz', pgn: '[White "mandy"]\n\n1. e4 e5 *' }])
  })

  it('reads a month of chess.com games from the public archive', async () => {
    const pgn = '[White "Hikaru"]\n[Black "Gravity"]\n[Result "1-0"]\n[Opening "Sicilian Defense"]\n\n1. e4 c5 2. Nc3 1-0'
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ games: [{ url: 'https://www.chess.com/game/live/1', pgn, end_time: Date.UTC(2024, 0, 1) / 1000, time_class: 'blitz', rules: 'chess',
      eco: 'https://www.chess.com/openings/Closed-Sicilian-Defense', white: { username: 'Hikaru', rating: 3236, result: 'win' }, black: { username: 'Gravity', rating: 2867, result: 'resigned' } }] }), { status: 200 })))
    const games = await chessComGamesOfMonth('hikaru', 2024, 1)
    expect(games[0]).toMatchObject({ source: 'chesscom', white: 'Hikaru', black: 'Gravity', whiteElo: 3236, blackElo: 2867, result: '1-0', ending: 'resigned', opening: 'Closed Sicilian Defense', moves: 2, date: '2024-01-01' })
  })
})
