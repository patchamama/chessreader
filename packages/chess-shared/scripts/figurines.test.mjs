import { describe, expect, it } from 'vitest'
import { toFigurines, fromFigurines } from './figurines.mjs'

describe('comment notation stored with figurines (a language-free notation)', () => {
  it('turns the piece letters of each language into figurines, leaving pawn moves and castling', () => {
    expect(toFigurines('After 13.Bxe6 Qh4+ 14.O-O dxe5 the bishop is lost.', 'en')).toBe('After 13.♗xe6 ♕h4+ 14.O-O dxe5 the bishop is lost.')
    expect(toFigurines('13.Axe6 Dh4+ 14.Cf3 Tad1', 'es')).toBe('13.♗xe6 ♕h4+ 14.♘f3 ♖ad1')
    expect(toFigurines('Nach 12.Sf3 Lb5 Dd8', 'de')).toBe('Nach 12.♘f3 ♗b5 ♕d8')
    expect(toFigurines('14.Fe3 Cd7', 'fr')).toBe('14.♗e3 ♘d7')
  })
  it('does not touch words, squares alone or figurines already there', () => {
    expect(toFigurines('Bad bishop on c4; the pawn on e5. ♘f3 is good. A5 matters? Be careful.', 'en')).toBe('Bad bishop on c4; the pawn on e5. ♘f3 is good. A5 matters? Be careful.')
  })
  it('writes figurines back as the letters of a language', () => {
    expect(fromFigurines('13.♗xe6 ♕h4+ 14.♘f3 ♖ad1', 'es')).toBe('13.Axe6 Dh4+ 14.Cf3 Tad1')
    expect(fromFigurines('12.♘f3 ♗b5 ♕d8', 'de')).toBe('12.Sf3 Lb5 Dd8')
    expect(fromFigurines('1.♘f3', 'en')).toBe('1.Nf3')
  })
})
