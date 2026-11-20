// scripts/pgnComments.mjs: every human {comment} of a PGN game on the position it
// speaks about, main line and variations, read straight from the moves.
import { Chess } from 'chess.js'
import { describe, expect, it } from 'vitest'
import { pgnPositionComments, splitPgnGames } from './pgnComments.mjs'

const fenAfter = (...moves) => {
  const c = new Chess()
  for (const m of moves) c.move(m)
  return c.fen()
}

const GAME = `[Event "Invented study: Open files"]
[White "Invented, White"]
[Black "Invented, Black"]
[Result "*"]

{ An invented game about the fight for the open file in the Spanish. }
1. e4 e5 2. Nf3 Nc6 3. Bb5 { [%clk 1:30:00] The Spanish: the bishop presses on the knight that defends e5. [%cal Gb5c6] }
3... a6 (3... Nf6 { The Berlin: Black counterattacks the pawn on e4 at once. } 4. O-O
  (4. d3 { A quiet move that keeps the centre closed and the game slow. }) 4... Nxe4)
  (3... f5 { The Schliemann gambit, a sharp and risky way to fight back. })
4. Ba4 { [%eval 0.3] } Nf6 { Mistake. Nf1 was best. } 5. O-O { short } Be7
6. Re1 ( { The quieter way, keeping the tension: } 6. d3 b5 7. Bb3 d6 { Every piece keeps its natural square here. } ) 6... b5 *
`

describe('pgnPositionComments', () => {
  const { tags, comments, moves } = pgnPositionComments(GAME)
  const byText = (start) => comments.find((c) => c.text.startsWith(start))

  it('reads the tags and the main line', () => {
    expect(tags).toMatchObject({ White: 'Invented, White', Black: 'Invented, Black' })
    expect(moves).toBe(12)
  })

  it('puts a comment after a main-line move on the position after that move, with its ply, move and SAN', () => {
    expect(byText('The Spanish')).toEqual({
      fen: fenAfter('e4', 'e5', 'Nf3', 'Nc6', 'Bb5'), ply: 5, move: 3, san: 'Bb5', variation: false,
      text: 'The Spanish: the bishop presses on the knight that defends e5.',
    })
  })

  it('walks variations, nested and sibling, each from the position it branches off', () => {
    expect(byText('The Berlin')).toMatchObject({ fen: fenAfter('e4', 'e5', 'Nf3', 'Nc6', 'Bb5', 'Nf6'), ply: 6, move: 3, san: 'Nf6', variation: true })
    expect(byText('A quiet move')).toMatchObject({ fen: fenAfter('e4', 'e5', 'Nf3', 'Nc6', 'Bb5', 'Nf6', 'd3'), ply: 7, move: 4, san: 'd3', variation: true })
    expect(byText('The Schliemann')).toMatchObject({ fen: fenAfter('e4', 'e5', 'Nf3', 'Nc6', 'Bb5', 'f5'), ply: 6, move: 3, san: 'f5' })
    expect(byText('Every piece')).toMatchObject({
      fen: fenAfter('e4', 'e5', 'Nf3', 'Nc6', 'Bb5', 'a6', 'Ba4', 'Nf6', 'O-O', 'Be7', 'd3', 'b5', 'Bb3', 'd6'), ply: 14, move: 7, san: 'd6',
    })
  })

  it('puts a leading comment before the first move: the start of the game, or the position a variation branches from', () => {
    expect(byText('An invented game')).toEqual({ fen: new Chess().fen(), ply: 0, move: 0, san: '', variation: false,
      text: 'An invented game about the fight for the open file in the Spanish.' })
    // "( { The quieter way, keeping the tension: } 6. d3 …)" speaks about the position before 6. Re1, after 5... Be7.
    expect(byText('The quieter way')).toMatchObject({ fen: fenAfter('e4', 'e5', 'Nf3', 'Nc6', 'Bb5', 'a6', 'Ba4', 'Nf6', 'O-O', 'Be7'), ply: 10, move: 5, san: 'Be7', variation: true })
  })

  it('drops clock, eval and arrow commands, engine-only notes and comments shorter than minChars', () => {
    const texts = comments.map((c) => c.text)
    expect(texts.join(' ')).not.toMatch(/\[%|Mistake\.|short/)
    expect(texts).toHaveLength(7)
    expect(pgnPositionComments(GAME, { minChars: 0 }).comments.map((c) => c.text)).toContain('short')
  })

  it('cuts a very long comment at a sentence end', () => {
    const long = `${'The knight is strong. '.repeat(50)}`
    const [c] = pgnPositionComments(`[Event "x"]\n\n1. e4 { ${long} } *`).comments
    expect(c.text.length).toBeLessThanOrEqual(700)
    expect(c.text.endsWith('strong.')).toBe(true)
  })

  it('numbers the moves of a game set up from a FEN as written', () => {
    const fen = 'r1bqkbnr/pppp1ppp/2n5/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 2 3'
    const [c] = pgnPositionComments(`[Event "x"]\n[SetUp "1"]\n[FEN "${fen}"]\n\n3. Bb5 { The bishop pins nothing yet but eyes the knight. } a6 *`).comments
    expect(c).toMatchObject({ ply: 1, move: 3, san: 'Bb5' })
    const board = new Chess(fen)
    board.move('Bb5')
    expect(c.fen).toBe(board.fen())
  })

  it('stops a line at an illegal move and goes on with the main line after the variation', () => {
    const { comments: cs } = pgnPositionComments(`[Event "x"]\n\n1. e4 e5 (1... Ke3 { This comment follows an impossible move. }) 2. Nf3 { The knight attacks the pawn on e5 now. } *`)
    expect(cs.map((c) => c.san)).toEqual(['Nf3'])
    expect(cs[0]).toMatchObject({ ply: 3, move: 2 })
  })
})

describe('splitPgnGames', () => {
  it('splits a multi-game export', () => {
    expect(splitPgnGames(`${GAME}\n\n${GAME}`)).toHaveLength(2)
  })
})
