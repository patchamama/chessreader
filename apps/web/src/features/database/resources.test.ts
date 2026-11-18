import { afterEach, describe, expect, it, vi } from 'vitest'
import { firstMoves, gamesPerDecade, openings, topPlayers, wikipediaSummary, type DbGame } from './resources'

const g = (id: string, white: string, black: string, year: number, result: string, first: string, opening = 'Ruy Lopez'): DbGame => ({ id, book: 'b', white, black, year, opening, result, moves: 40, first })
const games = [
  g('1', 'T. Petrosian', 'B. Spassky', 1966, '1-0', 'd4'), g('2', 'Spassky', 'Petrosian', 1969, '0-1', 'e4'),
  g('3', 'Petrosian', 'Fischer', 1971, '½-½', 'e4', 'Sicilian Defence'), g('4', 'Tal', 'Botvinnik', 1960, '1-0', 'e4'),
]

describe('database statistics (S15)', () => {
  it('games per decade', () => {
    expect(gamesPerDecade(games)).toEqual([{ label: '1960s', value: 3 }, { label: '1970s', value: 1 }])
  })
  it('players with most games, as White and Black, with their score (by surname)', () => {
    expect(topPlayers(games, 2)).toEqual([{ name: 'Petrosian', games: 3, white: 2, black: 1, score: 83 }, { name: 'Spassky', games: 2, white: 1, black: 1, score: 0 }])
  })
  it('first moves with the score of White', () => {
    expect(firstMoves(games)).toEqual([{ move: 'e4', games: 3, whiteScore: 50 }, { move: 'd4', games: 1, whiteScore: 100 }])
  })
  it('openings by number of games', () => {
    expect(openings(games)).toEqual([{ name: 'Ruy Lopez', games: 3 }, { name: 'Sicilian Defence', games: 1 }])
  })
})

describe('wikipedia (S15)', () => {
  afterEach(() => vi.unstubAllGlobals())
  it('reads a player summary in the reader language, else in English', async () => {
    const fetchMock = vi.fn(async (url: string) => url.startsWith('https://es.')
      ? new Response('{}', { status: 404 })
      : new Response(JSON.stringify({ extract: 'Tigran Petrosian was…', content_urls: { desktop: { page: 'https://en.wikipedia.org/wiki/Tigran_Petrosian' } } }), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)
    await expect(wikipediaSummary('Tigran Petrosian', 'es')).resolves.toEqual({ extract: 'Tigran Petrosian was…', url: 'https://en.wikipedia.org/wiki/Tigran_Petrosian' })
  })
})
