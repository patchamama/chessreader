import { describe, it, expect } from 'vitest'
import { recognizeGames } from '../../recognition/recognizeGames.js'
import { pathToNode, type GameTree } from '../../model/gameTree.js'

/** Every valid node as its SAN path from the root ("e4 e5 Nf3"). */
function paths(tree: GameTree): Set<string> {
  const out = new Set<string>()
  for (const n of tree.nodes.values()) {
    if (n.invalid || !n.fen) continue
    out.add(pathToNode(tree, n.id).map((id) => tree.nodes.get(id)!.san).join(' '))
  }
  return out
}
const mainSans = (tree: GameTree) => tree.mainline.map((id) => tree.nodes.get(id)!.san)

// Real annotated games (Lichess studies): parenthesised text is a variation.

describe('a "1." inside parentheses is a variation, not a new game', () => {
  const TEXT =
    '1. g4? { Mistake. c4 was best. } (1. c4 e5 2. g3 Nf6 3. Bg2 Bc5) 1... d5 2. e3 e5 3. h4 Nc6 4. c3 Be6'

  for (const algorithm of [1, 2, 3] as const) {
    it(`algorithm ${algorithm}: one game with the full mainline`, () => {
      const games = recognizeGames(TEXT, { algorithm })
      expect(games).toHaveLength(1)
      expect(mainSans(games[0].tree)).toEqual(['g4', 'd5', 'e3', 'e5', 'h4', 'Nc6', 'c3', 'Be6'])
    })
  }

  for (const algorithm of [2, 3] as const) {
    it(`algorithm ${algorithm}: "(1. c4 …)" is a first-move variation`, () => {
      const p = paths(recognizeGames(TEXT, { algorithm })[0].tree)
      expect(p.has('c4 e5 g3 Nf6 Bg2 Bc5')).toBe(true)
    })
  }

  it('algorithm 1 keeps the mainline only', () => {
    const tree = recognizeGames(TEXT, { algorithm: 1 })[0].tree
    expect(paths(tree).size).toBe(8)
  })

  it('two games back to back are still split on a top-level "1."', () => {
    const two = '1. e4 e5 2. Nf3 Nc6 (2... d6 3. d4) 3. Bb5 1-0\n1. d4 d5 2. c4 e6'
    for (const algorithm of [1, 2, 3] as const) {
      expect(recognizeGames(two, { algorithm })).toHaveLength(2)
    }
  })
})

describe('a variation nested inside a variation branches from the enclosing line', () => {
  // Harikrishna – Nesterov (annotated study), from move 15.
  const TEXT =
    '1. e4 e5 2. Nf3 Nc6 3. Bc4 Bc5 4. c3 Nf6 5. d4 exd4 6. cxd4 Bb4+ 7. Nc3 Nxe4 8. O-O Bxc3 ' +
    '(8... Nxc3 9. bxc3 Bxc3 (9... d5 10. cxb4 dxc4 11. Re1+) 10. Ba3) 9. d5 Bf6 10. Re1 Ne7'

  for (const algorithm of [2, 3] as const) {
    it(`algorithm ${algorithm}: nested line hangs from the enclosing variation`, () => {
      const tree = recognizeGames(TEXT, { algorithm })[0].tree
      const p = paths(tree)
      const pre = 'e4 e5 Nf3 Nc6 Bc4 Bc5 c3 Nf6 d4 exd4 cxd4 Bb4+ Nc3 Nxe4 O-O'
      expect(p.has(`${pre} Nxc3 bxc3 Bxc3 Ba3`)).toBe(true)
      expect(p.has(`${pre} Nxc3 bxc3 d5 cxb4 dxc4 Re1+`)).toBe(true)
      expect(mainSans(tree).slice(-4)).toEqual(['d5', 'Bf6', 'Re1', 'Ne7'])
      expect(tree.errors).toEqual([])
    })
  }
})

describe('sibling variations "(…) (…)" both fork from the same move', () => {
  const TEXT =
    '1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 4. Ba4 Nf6 5. O-O Be7?! (5... b5? 6. Bb3 Bb7 7. d3 $16) ' +
    '(5... Nxe4! 6. d4 b5! 7. Bb3 d5 8. dxe5 Be6 $132) (5... d6! 6. c3 Bd7 $132) 6. Re1 b5 7. Bb3 d6'
  const pre = 'e4 e5 Nf3 Nc6 Bb5 a6 Ba4 Nf6 O-O'

  for (const algorithm of [2, 3] as const) {
    it(`algorithm ${algorithm}`, () => {
      const tree = recognizeGames(TEXT, { algorithm })[0].tree
      const p = paths(tree)
      expect(p.has(`${pre} b5 Bb3 Bb7 d3`)).toBe(true)
      expect(p.has(`${pre} Nxe4 d4 b5 Bb3 d5 dxe5 Be6`)).toBe(true)
      expect(p.has(`${pre} d6 c3 Bd7`)).toBe(true)
      expect(mainSans(tree).slice(-5)).toEqual(['Be7', 'Re1', 'b5', 'Bb3', 'd6'])
      expect(p.size).toBe(28)
    })
  }
})

describe('PGN noise does not break the lines', () => {
  it('a NAG between the white and black move keeps them chained', () => {
    const TEXT = '1. e4 e5 2. Nf3 $14 Nc6 3. Bb5 (3. Bc4 $18 Bc5 (3... Nf6 4. d3) 4. c3) 3... a6'
    for (const algorithm of [1, 2, 3] as const) {
      const tree = recognizeGames(TEXT, { algorithm })[0].tree
      expect(mainSans(tree)).toEqual(['e4', 'e5', 'Nf3', 'Nc6', 'Bb5', 'a6'])
      if (algorithm !== 1) {
        expect(paths(tree).has('e4 e5 Nf3 Nc6 Bc4 Bc5 c3')).toBe(true)
        expect(paths(tree).has('e4 e5 Nf3 Nc6 Bc4 Nf6 d3')).toBe(true)
      }
    }
  })

  it('a multi-line comment does not end the mainline', () => {
    const TEXT = '1. e4 c5 2. Nf3 Nc6 { Her main weapon was 2...d6.\nFor this event she prepared a new approach. } 3. d4 cxd4 4. Nxd4 Nf6'
    for (const algorithm of [1, 2, 3] as const) {
      const tree = recognizeGames(TEXT, { algorithm })[0].tree
      expect(mainSans(tree)).toEqual(['e4', 'c5', 'Nf3', 'Nc6', 'd4', 'cxd4', 'Nxd4', 'Nf6'])
    }
  })

  it('an emoticon or a stray bracket inside a comment does not close the variation', () => {
    const TEXT =
      '1. e4 e5 2. Nf3 Nc6 (2... d6 { a nice entertainment line :) } 3. d4 exd4) 3. Bb5 { I would do the same (Sorry :). } 3... a6 4. Ba4'
    for (const algorithm of [1, 2, 3] as const) {
      const tree = recognizeGames(TEXT, { algorithm })[0].tree
      expect(mainSans(tree)).toEqual(['e4', 'e5', 'Nf3', 'Nc6', 'Bb5', 'a6', 'Ba4'])
      if (algorithm !== 1) expect(paths(tree).has('e4 e5 Nf3 d6 d4 exd4')).toBe(true)
    }
  })
})
