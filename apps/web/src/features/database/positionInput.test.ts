import { describe, expect, it } from 'vitest'
import { parsePositionInput } from './positionInput'

describe('parsePositionInput (S2)', () => {
  it('reads a FEN', () => {
    const r = parsePositionInput('rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1')
    expect(r).toEqual({ kind: 'fen', fen: 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1' })
  })
  it('reads a PGN as a move list with the FEN after each move', () => {
    const r = parsePositionInput('[Event "x"]\n\n1. e4 e5 2. Nf3 *')
    expect(r.kind).toBe('pgn')
    if (r.kind !== 'pgn') return
    expect(r.moves.map((m) => m.label)).toEqual(['1. e4', '1... e5', '2. Nf3'])
    expect(r.moves[0].fen).toBe('rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1')
  })
  it('rejects invalid input', () => {
    expect(parsePositionInput('hello world')).toEqual({ kind: 'error', message: expect.stringMatching(/not a valid FEN or PGN/i) })
    expect(parsePositionInput('1. e4 e4 *')).toMatchObject({ kind: 'error' })
    expect(parsePositionInput('   ')).toMatchObject({ kind: 'error' })
  })
})
