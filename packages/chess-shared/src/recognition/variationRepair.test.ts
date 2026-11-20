import { describe, it, expect } from 'vitest'
import { recognizeGames } from './recognizeGames.js'

function lines(text: string) {
  const [game] = recognizeGames(text, { algorithm: 2 })
  const { tree } = game
  const run = (ids: string[]) => ids.map((id) => tree.nodes.get(id)!)
  return {
    tree,
    variations: [...tree.variations.values()].flat().map((ids) => run(ids).map((n) => n.san)),
    corrected: [...tree.nodes.values()].filter((n) => n.correctedFrom).map((n) => [n.correctedFrom, n.san]),
  }
}

const MAIN = '1 e4 e5 2 Nf3 Nc6 3 Bb5 a6'

describe('a wrongly named piece inside a variation', () => {
  it('names the queen where the written king letter cannot go (K → Q)', () => {
    const r = lines(`${MAIN} (3...Bc5 4 c3 Kf6 5 d4 Qg6) 4 Ba4 Nf6`)
    expect(r.variations).toEqual([['Bc5', 'c3', 'Qf6', 'd4', 'Qg6']])
    expect(r.corrected).toEqual([['Kf6', 'Qf6']])
    expect(r.tree.errors.map((e) => [e.kind, e.san, e.suggestion])).toEqual([['wrong-move', 'Kf6', 'Qf6']])
  })

  it('names the queen where a rook was written (R → Q)', () => {
    const r = lines(
      '1 e4 e5 2 Nf3 Nc6 3 Bc4 Bc5 4 c3 Nf6 (4...Bb6 5 d4 exd4 6 O-O d3 7 Rb3 Qf6 8 Qb5) 5 d4 exd4',
    )
    // Only the queen can go on to b5; a bishop on b3 cannot.
    expect(r.variations[0]).toEqual(['Bb6', 'd4', 'exd4', 'O-O', 'd3', 'Qb3', 'Qf6', 'Qb5'])
    expect(r.corrected).toEqual([['Rb3', 'Qb3']])
  })

  it('names the bishop where a knight was written (N → B)', () => {
    const r = lines('1 d4 d5 2 Nf3 Nf6 3 c4 e6 (3...c6 4 Nf4 Nbd7 5 e3) 4 Nc3 Be7')
    expect(r.variations).toEqual([['c6', 'Bf4', 'Nbd7', 'e3']])
    expect(r.corrected).toEqual([['Nf4', 'Bf4']])
  })

  it('does not repair when several pieces fit the following moves equally', () => {
    const r = lines(`${MAIN} (3...Bc5 4 c3 Kf6 5 d4 exd4) 4 Ba4 Nf6`)
    expect(r.variations[0]).toEqual(['Bc5', 'c3'])
    expect(r.corrected).toEqual([])
    expect(r.tree.errors.filter((e) => e.kind === 'wrong-move')).toEqual([])
  })

  it('does not repair when the following moves stay illegal', () => {
    const r = lines(`${MAIN} (3...Bc5 4 c3 Kf6 5 d4 Qh1) 4 Ba4 Nf6`)
    expect(r.variations[0]).toEqual(['Bc5', 'c3'])
    expect(r.corrected).toEqual([])
    expect(r.tree.errors.filter((e) => e.kind === 'wrong-move')).toEqual([])
  })

  it('leaves a legal variation untouched', () => {
    const r = lines(`${MAIN} (3...Bc5 4 c3 Qf6 5 d4 Qg6) 4 Ba4 Nf6`)
    expect(r.variations).toEqual([['Bc5', 'c3', 'Qf6', 'd4', 'Qg6']])
    expect(r.corrected).toEqual([])
  })
})
