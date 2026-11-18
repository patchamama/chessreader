import { describe, it, expect } from 'vitest'
import { formatSan, formatLine, formatMoveToken } from '../notation'

describe('formatSan (S12: one formatter for every SAN shown)', () => {
  it('writes pieces with the letters of the language', () => {
    expect(formatSan('Nf3', 'en', 'letters')).toBe('Nf3')
    expect(formatSan('Nf3', 'es', 'letters')).toBe('Cf3')
    expect(formatSan('Qxd8+', 'es', 'letters')).toBe('Dxd8+')
    expect(formatSan('Bb5', 'es', 'letters')).toBe('Ab5')
    expect(formatSan('Rad1', 'es', 'letters')).toBe('Tad1')
    expect(formatSan('Kg1', 'es', 'letters')).toBe('Rg1')
    expect(formatSan('Nf3', 'de', 'letters')).toBe('Sf3')
    expect(formatSan('Bc4', 'de', 'letters')).toBe('Lc4')
  })

  it('writes pieces as figurines', () => {
    expect(formatSan('Nf3', 'es', 'figurine')).toBe('♞f3')
    expect(formatSan('Qxd8#', 'en', 'figurine')).toBe('♛xd8#')
    expect(formatSan('Kg1', 'de', 'figurine')).toBe('♚g1')
  })

  it('maps the promotion piece too', () => {
    expect(formatSan('e8=Q+', 'es', 'letters')).toBe('e8=D+')
    expect(formatSan('exd1=N', 'en', 'figurine')).toBe('exd1=♞')
  })

  it('leaves pawn moves, castling and words untouched', () => {
    expect(formatSan('e4', 'es', 'figurine')).toBe('e4')
    expect(formatSan('exd5', 'es', 'letters')).toBe('exd5')
    expect(formatSan('O-O-O', 'es', 'figurine')).toBe('O-O-O')
    expect(formatSan('Black', 'es', 'figurine')).toBe('Black')
  })

  it('accepts figurine input (engine lines) and turns it into letters', () => {
    expect(formatSan('♞f3', 'es', 'letters')).toBe('Cf3')
    expect(formatSan('♘f3', 'en', 'letters')).toBe('Nf3')
    expect(formatSan('♛a7', 'en', 'figurine')).toBe('♛a7')
  })
})

describe('formatLine', () => {
  it('formats every move of a numbered line and keeps the numbers', () => {
    expect(formatLine('1. e4 e5 2. Nf3 Nc6 3. Bb5', 'es', 'letters')).toBe('1. e4 e5 2. Cf3 Cc6 3. Ab5')
    expect(formatLine('12... ♚e1 13. ♛a7', 'en', 'letters')).toBe('12... Ke1 13. Qa7')
    expect(formatLine('1.Nf3 d5', 'en', 'figurine')).toBe('1.♞f3 d5')
  })
})

describe('formatMoveToken (a token written in a book, with its canonical SAN)', () => {
  it('replaces the written piece symbol, whatever its language, by the chosen one', () => {
    expect(formatMoveToken('Cf3', 'Nf3', 'es', 'figurine')).toBe('♞f3')
    expect(formatMoveToken('♘f3', 'Nf3', 'es', 'letters')).toBe('Cf3')
    expect(formatMoveToken('Rd1', 'Kd1', 'en', 'letters')).toBe('Kd1')
    expect(formatMoveToken('15.Cxe5!', 'Nxe5', 'de', 'letters')).toBe('15.Sxe5!')
  })

  it('keeps the book\'s own figurine glyph when figurines are chosen', () => {
    expect(formatMoveToken('9... ♘b6', 'Nb6', 'es', 'figurine')).toBe('9... ♘b6')
    expect(formatMoveToken('9... ♘b6', 'Nb6', 'es', 'letters')).toBe('9... Cb6')
  })

  it('keeps tokens without a piece symbol as written', () => {
    expect(formatMoveToken('e4', 'e4', 'es', 'figurine')).toBe('e4')
    expect(formatMoveToken('0-0', 'O-O', 'es', 'figurine')).toBe('0-0')
  })

  it('formats SAN written in English when no canonical SAN is known', () => {
    expect(formatMoveToken('Nf3', undefined, 'es', 'letters')).toBe('Cf3')
  })
})
