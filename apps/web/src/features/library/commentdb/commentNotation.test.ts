import { describe, expect, it } from 'vitest'
import { commentInNotation } from './commentNotation'

describe('a stored comment written in the reader\'s notation', () => {
  const stored = 'After 12...♘b6 the ♗xe6 trade and ♕h4+ with O-O follow.'
  it('keeps figurines when the reader uses them', () => {
    expect(commentInNotation(stored, 'es', true)).toBe(stored)
  })
  it('writes the piece letters of the reader\'s language otherwise', () => {
    expect(commentInNotation(stored, 'es', false)).toBe('After 12...Cb6 the Axe6 trade and Dh4+ with O-O follow.')
    expect(commentInNotation(stored, 'en', false)).toBe('After 12...Nb6 the Bxe6 trade and Qh4+ with O-O follow.')
    expect(commentInNotation(stored, 'de', false)).toBe('After 12...Sb6 the Lxe6 trade and Dh4+ with O-O follow.')
  })
})
