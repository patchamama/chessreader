import { describe, expect, it } from 'vitest'
import { ideaCues, ideaSegments } from './ideaCues'

// White knight on c3, Black queen on e7: Nd5 attacks c7 and e7.
const FEN = 'rnb1kbnr/ppppqppp/8/8/8/2N5/PPPPPPPP/R1BQKBNR w KQkq - 0 1'
const ES = 'Cd5. Ataque doble: el caballo ataca a la vez el peón de c7 y la dama de e7.'

describe('tutor ideas on the board (S14.3)', () => {
  it('an arrow for the move named (in the selected language) and the squares of the attacked pieces', () => {
    const board = ideaCues(ES, FEN)
    expect(board.arrows).toEqual([expect.objectContaining({ startSquare: 'c3', endSquare: 'd5' })])
    expect(Object.keys(board.squareStyles)).toEqual(expect.arrayContaining(['c7', 'e7']))
  })
  it('English and German letters work too', () => {
    expect(ideaCues('Nd5. Double attack: the knight attacks the pawn on c7 and the queen on e7.', FEN).arrows[0]).toMatchObject({ startSquare: 'c3', endSquare: 'd5' })
    expect(ideaCues('Sd5 greift an.', FEN).arrows[0]).toMatchObject({ startSquare: 'c3', endSquare: 'd5' })
  })
  it('splits the text into hoverable parts: each move and each named square shows itself', () => {
    const parts = ideaSegments(ES, FEN)
    expect(parts.map((p) => p.text).join('')).toBe(ES)
    const move = parts.find((p) => p.text === 'Cd5')!
    expect(move.board?.arrows[0]).toMatchObject({ startSquare: 'c3', endSquare: 'd5' })
    const queen = parts.find((p) => p.text === 'dama de e7')!
    expect(Object.keys(queen.board!.squareStyles)).toEqual(['e7'])
    expect(parts.find((p) => p.text.startsWith(' y la'))?.board).toBeUndefined()
  })
  it('a text without moves or squares draws nothing', () => {
    expect(ideaCues('Checkmate.', FEN)).toMatchObject({ arrows: [], squareStyles: {} })
  })
})

describe('figurine notation (S14, notation setting)', () => {
  it('a move written with a figurine draws its arrow too', () => {
    expect(ideaCues('♞d5 ataca c7.', FEN).arrows[0]).toMatchObject({ startSquare: 'c3', endSquare: 'd5' })
  })
})
