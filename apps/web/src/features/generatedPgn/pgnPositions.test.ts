import { describe, expect, it } from 'vitest'
import { pgnPositions } from './pgnPositions'

describe('pgnPositions', () => {
  it('walks the main line of a commented PGN, ignoring comments and variations', () => {
    const p = pgnPositions('[White "A"]\n\n1. e4 {Invented.} e5 (1... c5 2. Nf3) 2. Nf3 1-0')
    expect(p?.map((x) => x.san)).toEqual([null, 'e4', 'e5', 'Nf3'])
    expect(p?.[0].fen).toBe('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1')
    expect(p?.[1]).toMatchObject({ from: 'e2', to: 'e4' })
  })

  it('starts from the FEN header', () => {
    const p = pgnPositions('[SetUp "1"]\n[FEN "4k3/8/8/8/8/8/4P3/4K3 w - - 0 1"]\n\n1. e4 Kd7 *')
    expect(p?.[0].fen).toBe('4k3/8/8/8/8/8/4P3/4K3 w - - 0 1')
    expect(p?.map((x) => x.san)).toEqual([null, 'e4', 'Kd7'])
  })

  it('gives null for text that is not a playable PGN', () => {
    expect(pgnPositions('1. e5 e5 *')).toBeNull()
  })
})
