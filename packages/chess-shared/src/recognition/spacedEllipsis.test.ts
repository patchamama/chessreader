import { describe, it, expect } from 'vitest'
import { recognizeGames } from '../recognition/recognizeGames'
import { tokenize } from '../notation/sanTokenizer'

// English books (Kasparov, "My Great Predecessors") print Black's move numbers with a space before the dots: "5 ... Kd8".
const GAME = 'The game went:\n1 e4 e5 2 f4 f5?! 3 exf5 Qh4+ 4 g3 Qe7 5 Qh5+?! (5 fxe5! Qxe5+ 6 Qe2 is better) 5 ... Kd8 6 fxe5 Qxe5+ 7 Be2 (7 Qe2! Qxf5 8 Bh3) 7 ... Nf6 8 Qf3 d5 9 g4? h5! 10 h3? hxg4'

describe('a move number with a space before its dots ("5 ... Kd8")', () => {
  it('is a black move number', () => {
    const t = tokenize('5 ... Kd8').filter((x) => x.type === 'move-number')
    expect(t).toHaveLength(1)
    expect(t[0]).toMatchObject({ moveNumber: 5, isEllipsis: true, color: 'black' })
  })
  it('also with two dots or the ellipsis character, and the usual forms keep working', () => {
    for (const s of ['5 .. Kd8', '5 … Kd8', '5… Kd8', '5... Kd8']) expect(tokenize(s).find((x) => x.type === 'move-number')).toMatchObject({ moveNumber: 5, isEllipsis: true })
    expect(tokenize('5. Kd8').find((x) => x.type === 'move-number')).toMatchObject({ moveNumber: 5, isEllipsis: false })
    expect(tokenize('5 Kd8').find((x) => x.type === 'move-number')).toMatchObject({ moveNumber: 5, isEllipsis: false })
  })
  it('the whole game of the book is read: 20 plies in the main line, 2 variations, no errors', () => {
    const [g] = recognizeGames(GAME, { algorithm: 2 })
    const main = g.tree.mainline.map((id) => g.tree.nodes.get(id)!.san)
    expect(main).toEqual(['e4', 'e5', 'f4', 'f5', 'exf5', 'Qh4+', 'g3', 'Qe7', 'Qh5+', 'Kd8', 'fxe5', 'Qxe5+', 'Be2', 'Nf6', 'Qf3', 'd5', 'g4', 'h5', 'h3', 'hxg4'])
    expect([...g.tree.variations.values()].reduce((n, lines) => n + lines.length, 0)).toBe(2)
    expect(g.tree.errors).toEqual([])
  })
  it('prose with a number and dots that is not a move is left alone', () => {
    const t = tokenize('See page 5 ... and then chapter 7 ... for the rest')
    expect(t.filter((x) => x.type === 'move')).toHaveLength(0)
  })
})
