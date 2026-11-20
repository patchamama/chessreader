import { describe, expect, it } from 'vitest'
import { Chess } from 'chess.js'
import { normalizePgn, numberMoves } from './pgnNormalize'

describe('normalizePgn (S7, S8)', () => {
  it('adds the dots to the move numbers (S7)', () => {
    const r = normalizePgn('1 e4 e5 2 Cf3')
    expect(r.text).toBe('1. e4 e5 2. Cf3')
    expect(r.language).toBe('es')
    expect(r.moves.map((m) => m.san)).toEqual(['e4', 'e5', 'Nf3'])
    expect(r.unrecognised).toEqual([])
  })
  it('fixes the case of piece letters (S8)', () => {
    const r = normalizePgn('1. e4 e5 2. Nf3 NC6')
    expect(r.text).toBe('1. e4 e5 2. Nf3 Nc6')
    expect(r.moves.map((m) => m.san)).toEqual(['e4', 'e5', 'Nf3', 'Nc6'])
  })
  it('splits glued numbers and reads figurines', () => {
    const r = normalizePgn('1.e4 e5 2.♘f3 ♘c6 3.♗b5')
    expect(r.text).toBe('1. e4 e5 2. Nf3 Nc6 3. Bb5')
    expect(r.moves).toHaveLength(5)
  })
  it('reads castling spelled with letters or zeros, captures, check and mark symbols', () => {
    const r = normalizePgn('1. e4 e5 2. Nf3 Nc6 3. Bc4 Nf6 4. d3 Bc5 5. 0-0 o-o 6. Nxe5!? Nxe5+')
    expect(r.unrecognised).toEqual([])
    expect(r.moves.map((m) => m.san).slice(8, 10)).toEqual(['O-O', 'O-O'])
    expect(r.text).toContain('5. O-O O-O')
    expect(r.text).toContain('6. Nxe5!? Nxe5+')
  })
  it('reads promotions in the three spellings', () => {
    for (const p of ['bxa8=Q', 'bxa8Q', 'bxa8q']) {
      const r = normalizePgn(`1. e4 d5 2. exd5 c6 3. dxc6 Nf6 4. cxb7 Nc6 5. ${p}`)
      expect(r.moves.at(-1)?.san).toBe('bxa8=Q')
      expect(r.text.endsWith('5. bxa8=Q')).toBe(true)
    }
    const spanish = normalizePgn('1. e4 d5 2. exd5 c6 3. dxc6 Cf6 4. cxb7 Cc6 5. bxa8D', { language: 'es' })
    expect(spanish.moves.at(-1)?.san).toBe('bxa8=Q')
    const german = normalizePgn('1. e4 d5 2. exd5 c6 3. dxc6 Sf6 4. cxb7 Sc6 5. bxa8=D', { language: 'de' })
    expect(german.moves.at(-1)?.san).toBe('bxa8=Q')
  })
  it('reads Spanish and German piece letters', () => {
    expect(normalizePgn('1. e4 e5 2. Cf3 Cc6 3. Ab5 Dh4', { language: 'es' }).moves.map((m) => m.san)).toEqual(['e4', 'e5', 'Nf3', 'Nc6', 'Bb5', 'Qh4'])
    expect(normalizePgn('1. e4 e5 2. Sf3 Sc6 3. Lb5 Dh4', { language: 'de' }).moves.map((m) => m.san)).toEqual(['e4', 'e5', 'Nf3', 'Nc6', 'Bb5', 'Qh4'])
    expect(normalizePgn('1. e4 e5 2. Nf3 Nc6 3. Bb5 Qh4', { language: 'en' }).moves).toHaveLength(6)
  })
  it('auto-detects the language that makes the most moves legal', () => {
    expect(normalizePgn('1. e4 e5 2. Sf3 Sc6').language).toBe('de')
    expect(normalizePgn('1. e4 e5 2. Cf3 Cc6').language).toBe('es')
    expect(normalizePgn('1. e4 e5 2. Nf3 Nc6').language).toBe('en')
    expect(normalizePgn('1. e4 e5').language).toBe('en')
  })
  it('keeps headers, results and comments out of the moves', () => {
    const r = normalizePgn('[Event "x"]\n\n1 e4 {king pawn} e5 $1 2 Nf3 (2 f4) Nc6 1-0')
    expect(r.moves.map((m) => m.san)).toEqual(['e4', 'e5', 'Nf3', 'Nc6'])
    expect(r.text).toContain('[Event "x"]')
    expect(r.text).toContain('1. e4 e5 2. Nf3 Nc6')
  })
  it('reports the unrecognised token, its place and the unknown characters', () => {
    const r = normalizePgn('1. e4 e5 2. Nf3 N@c6 3. Bb5')
    expect(r.moves.map((m) => m.san)).toEqual(['e4', 'e5', 'Nf3'])
    expect(r.unrecognised).toEqual([{ token: 'N@c6', ply: 4, label: '2... N@c6', chars: ['@'] }])
    const illegal = normalizePgn('1. e4 e4')
    expect(illegal.unrecognised).toEqual([{ token: 'e4', ply: 2, label: '1... e4', chars: [] }])
  })
  it('sets the move numbers from a FEN header', () => {
    const r = normalizePgn('[FEN "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1"]\n\ne5 Nf3')
    expect(r.moves.map((m) => m.label)).toEqual(['1... e5', '2. Nf3'])
  })
})

describe('numberMoves (S18)', () => {
  it('numbers the moves like a PGN', () => {
    expect(numberMoves(new Chess().fen(), ['e4', 'e5', 'Nc3'])).toBe('1. e4 e5 2. Nc3')
  })
  it('starts with "1..." when Black moves first', () => {
    expect(numberMoves('rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1', ['e5', 'Nf3'])).toBe('1... e5 2. Nf3')
  })
})
