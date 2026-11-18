import { describe, expect, it } from 'vitest'
import { chapterErrors, errorKinds } from './bookErrors'

describe('errors of a book (S29)', () => {
  it('lists each game of a chapter with its errors, ranked material for review', () => {
    const html = '<p>Alekhine – Capablanca</p><p>1. e4 e5 2. Nf3 Nc6 3. Bb5 a6</p><p>Second game</p><p>1. d4 d5 2. c4 e6 3. Qx9</p><p>Then 7. Nxe5 was possible.</p>'
    const games = chapterErrors(7, 2, html)
    expect(games[0]).toMatchObject({ bookId: 7, chapter: 2, gameIndex: 0, moves: 3 })
    expect(games[0].label).toMatch(/^Alekhine – Capablanca · e4 e5 Nf3 Nc6/)
    expect(errorKinds(games)).toEqual(expect.objectContaining({}))
  })
})
