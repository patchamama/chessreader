import { describe, it, expect } from 'vitest'
import { parseFollowingMoves, moveConstraints, squaresBetween } from '../../index.js'

describe('parseFollowingMoves', () => {
  it('reads side to move, move number and the main line (Spanish letters, no dot after the number)', () => {
    const r = parseFollowingMoves('21...Txe3 22 d4 Cf6 23.Txe3 (23.Ad3 h6) dxe5')
    expect(r).toMatchObject({ sideToMove: 'b', moveNumber: 21 })
    expect(r!.moves.map((m) => [m.san, m.color, m.moveNumber])).toEqual([
      ['Rxe3', 'b', 21], ['d4', 'w', 22], ['Nf6', 'b', 22], ['Rxe3', 'w', 23], ['dxe5', 'b', 23],
    ])
    expect(r!.moves[0].written).toBe('Txe3')
  })

  it('reads figurines and white to move', () => {
    const r = parseFollowingMoves('22.♘f3 ♝g4')
    expect(r).toMatchObject({ sideToMove: 'w', moveNumber: 22 })
    expect(r!.moves.map((m) => m.san)).toEqual(['Nf3', 'Bg4'])
  })

  it('returns null when no numbered move follows', () => {
    expect(parseFollowingMoves('Una posición interesante.')).toBeNull()
  })
})

describe('moveConstraints', () => {
  it('"21...Txe3": a black rook on the e-file or 3rd rank, a white piece on e3', () => {
    const [c] = moveConstraints('21...Txe3 22 d4')!.constraints
    expect(c).toMatchObject({ piece: 'r', color: 'b', to: 'e3', capture: true, enPassant: false })
    expect([...c.from].sort()).toEqual(['a3', 'b3', 'c3', 'd3', 'e1', 'e2', 'e4', 'e5', 'e6', 'e7', 'e8', 'f3', 'g3', 'h3'])
    expect(c.requires).toContainEqual({ square: 'e3', color: 'w', piece: null })
  })

  it('"22 d4": a white pawn on d2 or d3', () => {
    const c = moveConstraints('21...Txe3 22 d4')!.constraints[1]
    expect(c).toMatchObject({ piece: 'p', color: 'w', to: 'd4', capture: false })
    expect([...c.from].sort()).toEqual(['d2', 'd3'])
  })

  it('black pawn pushes, pawn captures, en passant and promotion', () => {
    const cs = moveConstraints('10...d5 11.exd6 e1D')!.constraints
    expect([...cs[0].from].sort()).toEqual(['d6', 'd7'])
    expect(cs[1]).toMatchObject({ piece: 'p', from: ['e5'], capture: true, enPassant: true })
    expect(cs[2]).toMatchObject({ piece: 'p', color: 'b', from: ['e2'], promotion: 'q' })
  })

  it('disambiguation narrows the origins', () => {
    const cs = moveConstraints('1.Tae1 C1d2')!.constraints
    expect(cs[0].from).toEqual(['a1'])
    expect([...cs[1].from].sort()).toEqual(['b1', 'f1'])
  })

  it('castling implies king and rook on their squares and an empty path', () => {
    const [w, b] = moveConstraints('15.0-0 0-0-0')!.constraints
    expect(w).toMatchObject({ piece: 'k', from: ['e1'], to: 'g1', castle: 'O-O' })
    expect(w.requires).toEqual(expect.arrayContaining([{ square: 'e1', color: 'w', piece: 'k' }, { square: 'h1', color: 'w', piece: 'r' }]))
    expect([...w.mustBeEmpty].sort()).toEqual(['f1', 'g1'])
    expect(b.requires).toEqual(expect.arrayContaining([{ square: 'e8', color: 'b', piece: 'k' }, { square: 'a8', color: 'b', piece: 'r' }]))
    expect([...b.mustBeEmpty].sort()).toEqual(['b8', 'c8', 'd8'])
  })

  it('squaresBetween gives the path a slider must find clear', () => {
    expect(squaresBetween('e7', 'e3')).toEqual(['e6', 'e5', 'e4'])
    expect(squaresBetween('a1', 'd4')).toEqual(['b2', 'c3'])
    expect(squaresBetween('g1', 'f3')).toEqual([])
  })
})
