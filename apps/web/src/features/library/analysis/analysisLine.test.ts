import { describe, expect, it } from 'vitest'
import { boardLine, commentGameHref, quotedMoves, START_FEN } from './analysisLine'

describe('analysisLine', () => {
  it('reads the mainline of a PGN, without comments, variations, NAGs or the result', () => {
    expect(boardLine({ title: 'g', pgn: '[White "a"]\n\n1. e4 {good} e5 $1 (1... c5 2. Nf3 (2. c3)) 2. Nf3 1-0' }))
      .toEqual({ startFen: START_FEN, moves: ['e4', 'e5', 'Nf3'] })
  })

  it('starts from the FEN tag of a PGN, or from the given position and moves', () => {
    const fen = '8/8/8/8/8/8/4K3/4k3 w - - 0 1'
    expect(boardLine({ title: 'g', pgn: `[FEN "${fen}"]\n\n1. Kd3 *` }).startFen).toBe(fen)
    expect(boardLine({ title: 'l', startFen: fen, moves: ['Kd3'] })).toEqual({ startFen: fen, moves: ['Kd3'] })
  })

  it('finds the moves a comment quotes, in English SAN, by offset (Spanish letters too)', () => {
    expect([...quotedMoves('Tras 1. e4 e5 2. Cf3 la casilla d5').values()]).toEqual(expect.arrayContaining(['e4', 'e5', 'Nf3']))
  })

  it('links the page of a comment game at its ply', () => {
    expect(commentGameHref('2-7', 14)).toMatch(/\/comment\/2-7\?ply=14$/)
    expect(commentGameHref('2-7')).toMatch(/\/comment\/2-7$/)
  })
})
