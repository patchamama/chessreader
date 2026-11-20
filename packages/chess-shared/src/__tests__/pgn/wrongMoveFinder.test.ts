import { describe, it, expect } from 'vitest'
import { findWrongMove } from '../../index.js'

const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'
const RUY = 'e4 e5 Nf3 Nc6 Bb5 a6 Ba4 Nf6 O-O Be7 Re1 b5 Bb3 d6 c3 O-O h3 Nb8 d4 Nbd7'.split(' ')

const at = (list: string[], i: number, v: string) => list.map((m, k) => (k === i ? v : m))

describe('findWrongMove', () => {
  it('a clean game has nothing to fix', () => {
    expect(findWrongMove({ sans: RUY, startFen: START })).toEqual({ failingPly: null, fixes: [] })
  })

  it('an OCR digit confusion ("Nfb" for "Nf6") ranks the substitution first', () => {
    const r = findWrongMove({ sans: at(RUY, 7, 'Nfb'), startFen: START })
    expect(r.failingPly).toBe(7)
    expect(r.fixes[0]).toMatchObject({ ply: 7, kind: 'substitute', from: 'Nfb', to: 'Nf6', playedAfter: 12 })
  })

  it('reads the printed move in Spanish letters ("Cf5" for "Nf6")', () => {
    const r = findWrongMove({ sans: at(RUY, 7, 'Cf5'), startFen: START })
    expect(r.fixes[0]).toMatchObject({ ply: 7, kind: 'substitute', to: 'Nf6', playedAfter: 12 })
  })

  it('a duplicated move is deleted', () => {
    const sans = [...RUY.slice(0, 3), 'Nf3', ...RUY.slice(3)]
    const r = findWrongMove({ sans, startFen: START })
    expect(r.fixes[0]).toMatchObject({ ply: 3, kind: 'delete', from: 'Nf3', playedAfter: 17 })
  })

  it('a missing move is inserted (only "...Nc6" lets "...Nb8" play later)', () => {
    const sans = [...RUY.slice(0, 3), ...RUY.slice(4)]
    const r = findWrongMove({ sans, startFen: START })
    expect(r.fixes[0]).toMatchObject({ ply: 3, kind: 'insert', to: 'Nc6', playedAfter: 16 })
  })

  it('two moves printed in the wrong order are swapped', () => {
    const sans = [...RUY.slice(0, 3), 'Bb5', 'Nc6', ...RUY.slice(5)]
    const r = findWrongMove({ sans, startFen: START })
    expect(r.fixes[0]).toMatchObject({ ply: 3, kind: 'swap', from: 'Bb5 Nc6', to: 'Nc6 Bb5', playedAfter: 15 })
  })

  it('a legal-but-wrong earlier move is found from where recognition stops', () => {
    // "9...Na5" for "9...Nb8" is legal; it only breaks two plies later at "10...Nbd7".
    const sans = at(RUY, 17, 'Na5')
    const r = findWrongMove({ sans, startFen: START, topN: 5 })
    expect(r.failingPly).toBe(19)
    expect(r.fixes[0]).toMatchObject({ ply: 17, kind: 'substitute', from: 'Na5', to: 'Nb8', playedAfter: 2 })
    expect(r.fixes.length).toBeLessThanOrEqual(5)
  })
})
