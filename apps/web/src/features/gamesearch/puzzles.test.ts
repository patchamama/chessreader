import { afterEach, describe, expect, it, vi } from 'vitest'
import { lichessDailyPuzzle, lichessNextPuzzle, puzzleMove, type Puzzle } from './puzzles'

const DAILY = {
  game: { id: 'uLO91CeH', perf: { name: 'Rapid' }, players: [{ name: 'rm59', color: 'white', rating: 1890 }, { name: 'konne', color: 'black', rating: 1748 }], pgn: 'd4 Nf6', clock: '15+0' },
  puzzle: { id: 'HofO6', rating: 1861, plays: 92814, solution: ['g3f4', 'e3f4', 'g4g3', 'h2g3', 'h3h2'], themes: ['endgame', 'crushing'], fen: '8/5n1k/8/1P3p2/3P1Np1/4PPbp/3BK2P/8 b - - 1 1', lastMove: 'e6f4', initialPly: 88 },
}

describe('Lichess puzzles', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('reads the puzzle of the day: position, solution, rating, themes and the game it comes from', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify(DAILY), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)
    const p = await lichessDailyPuzzle()
    expect(fetchMock.mock.calls[0][0]).toBe('https://lichess.org/api/puzzle/daily')
    expect(p).toEqual({
      id: 'HofO6', rating: 1861, plays: 92814, themes: ['endgame', 'crushing'],
      fen: '8/5n1k/8/1P3p2/3P1Np1/4PPbp/3BK2P/8 b - - 1 1', lastMove: 'e6f4',
      solution: ['g3f4', 'e3f4', 'g4g3', 'h2g3', 'h3h2'],
      game: { id: 'uLO91CeH', white: 'rm59 (1890)', black: 'konne (1748)', perf: 'Rapid', url: 'https://lichess.org/uLO91CeH#88' },
    })
  })

  it('the next puzzle is chosen for the token owner when there is a token', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify(DAILY), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)
    await lichessNextPuzzle('tok')
    expect(fetchMock).toHaveBeenCalledWith('https://lichess.org/api/puzzle/next', { headers: { Authorization: 'Bearer tok' } })
  })
})

describe('puzzleMove', () => {
  const puzzle: Puzzle = {
    id: 'HofO6', rating: 1861, plays: 1, themes: [], fen: '8/5n1k/8/1P3p2/3P1Np1/4PPbp/3BK2P/8 b - - 1 1', lastMove: 'e6f4',
    solution: ['g3f4', 'e3f4', 'g4g3', 'h2g3', 'h3h2'], game: { id: 'x', white: '', black: '', perf: '', url: '' },
  }

  it('a right move is answered with the reply of the solution', () => {
    expect(puzzleMove(puzzle, 0, 'g3f4')).toEqual({ result: 'correct', reply: 'e3f4', next: 2 })
  })

  it('a wrong move is wrong', () => {
    expect(puzzleMove(puzzle, 0, 'f7g5')).toEqual({ result: 'wrong' })
  })

  it('the last move of the solution solves it', () => {
    expect(puzzleMove(puzzle, 4, 'h3h2')).toEqual({ result: 'solved' })
  })

  it('any mate solves a mating puzzle, as on Lichess', () => {
    const mate: Puzzle = { ...puzzle, fen: '6k1/5ppp/8/8/8/8/5PPP/R3R1K1 w - - 0 1', solution: ['a1a8'] }
    expect(puzzleMove(mate, 0, 'e1e8')).toEqual({ result: 'solved' })
  })
})
