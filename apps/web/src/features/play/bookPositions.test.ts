import { describe, expect, it } from 'vitest'
import { Chess } from 'chess.js'
import { buildPositionIndex, bookCandidates, mainlineSans } from './bookPositions'

const game = (id: string, pgn: string, result: string, white: string, black: string, extra = {}) =>
  ({ id, white, black, year: 1900, opening: '', result, moves: 10, first: 'e4', pgn, ...extra })

describe('what the grandmasters of the books played here (S14.1)', () => {
  it('reads the main line of a PGN, without variations, comments or move numbers', () => {
    expect(mainlineSans('1. e4 (1. d4 f5 2. e4!?) 1... c5 2. Nf3 {En el Café} (2. f4) 2... Nc6?! 3. d4 1-0')).toEqual(['e4', 'c5', 'Nf3', 'Nc6', 'd4'])
  })
  it('indexes the positions and suggests the moves played from one, with how often, the results and the players', () => {
    const index = buildPositionIndex([
      { book: 'b1', games: [
        game('g1', '1. e4 c5 2. Nf3 d6', '1-0', 'Fischer', 'Tal', { termination: 'resignation' }),
        game('g2', '1. e4 c5 2. Nc3 Nc6', '0-1', 'Spassky', 'Petrosian'),
        game('g3', '1. e4 e5 2. Nf3', '1/2-1/2', 'Lasker', 'Capablanca'),
      ] },
    ])
    const after = new Chess(); after.move('e4'); after.move('c5')
    const cands = bookCandidates(index, after.fen())
    expect(cands.map((c) => [c.san, c.count])).toEqual([['Nf3', 1], ['Nc3', 1]])
    expect(cands[0].games[0]).toMatchObject({ gameId: 'g1', book: 'b1', white: 'Fischer', black: 'Tal', result: '1-0', termination: 'resignation' })
    expect(bookCandidates(index, new Chess().fen())).toEqual([expect.objectContaining({ san: 'e4', count: 3 })])
  })
})
