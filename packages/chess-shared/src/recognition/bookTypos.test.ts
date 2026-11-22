import { describe, it, expect } from 'vitest'
import { recognizeGames } from './recognizeGames'

const mainline = (text: string) => { const [g] = recognizeGames(text, { algorithm: 2 }); return { san: g.tree.mainline.map((id) => g.tree.nodes.get(id)!.san), errors: g.tree.errors } }
const PROMO = '1 e4 d5 2 exd5 c6 3 dxc6 Nf6 4 cxb7 Bd7 5 '

describe('promotion written without "=" (English books: "bxa8Q", "c1Q")', () => {
  it('is the promotion move, also with a check or an annotation', () => {
    expect(mainline(`${PROMO}bxa8Q Qd6`).san.slice(8, 9)).toEqual(['bxa8=Q'])
    expect(mainline(`${PROMO}bxa8Q+ Ke7`).san[8]).toMatch(/^bxa8=Q/)
    expect(mainline(`${PROMO}bxa8Q! Qd6`).san[8]).toBe('bxa8=Q')
  })
  it('the usual "=" form keeps working and the move shows as the book wrote it', () => {
    expect(mainline(`${PROMO}bxa8=Q Qd6`).san[8]).toBe('bxa8=Q')
    const [g] = recognizeGames(`${PROMO}bxa8Q Qd6`, { algorithm: 2 })
    expect(g.tree.nodes.get(g.tree.mainline[8])!.rawSan).toBe('bxa8Q')
  })
  it('a pawn push to the last rank with the piece letter after it, in a variation', () => {
    const r = mainline(`${PROMO}Nc3 (5 bxa8Q Qd6) 5 ... e6`)
    expect(r.errors).toEqual([])
  })
})

describe('Cyrillic look-alike letters in a square ("5 ... а6", the "а" is U+0430)', () => {
  const GAME = '1 e4 e5 2 Nf3 Nc6 3 Bb5 a6 4 Ba4 Nf6 5 O-O Be7 6 Re1 b5 7 Bb3 d6 8 c3 O-O 9 h3 Nb8 10 d4 Nbd7'
  it('reads the move as the Latin letter', () => {
    const r = mainline(`1 e4 e5 2 Nf3 Nc6 3 Bb5\n3 ... а6 4 Ba4 Nf6`)
    expect(r.san).toEqual(['e4', 'e5', 'Nf3', 'Nc6', 'Bb5', 'a6', 'Ba4', 'Nf6'])
    expect(r.errors).toEqual([])
    expect(mainline(GAME).san).toHaveLength(20)
  })
  it('also с (c), е (e) before a rank digit, and leaves Russian words alone', () => {
    const [g] = recognizeGames('1 е4 е5 2 Nf3 с6', { algorithm: 2 })
    expect(g.tree.mainline.map((id) => g.tree.nodes.get(id)!.san)).toEqual(['e4', 'e5', 'Nf3', 'c6'])
    expect(recognizeGames('Это слово без ходов, ае а', { algorithm: 2 })).toEqual([])
  })
})
