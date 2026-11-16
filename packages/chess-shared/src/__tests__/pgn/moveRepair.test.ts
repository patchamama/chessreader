import { describe, it, expect } from 'vitest'
import { findMoveRepair, sanSimilarity } from '../../pgn/moveRepair.js'
import { recognizeGames } from '../../recognition/recognizeGames.js'

const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'
// The Opera Game, Morphy 1858.
const OPERA =
  'e4 e5 Nf3 d6 d4 Bg4 dxe5 Bxf3 Qxf3 dxe5 Bc4 Nf6 Qb3 Qe7 Nc3 c6 Bg5 b5 Nxb5 cxb5 Bxb5+ Nbd7 O-O-O Rd8 Rxd7 Rxd7 Rd1 Qe6 Bxd7+ Nxd7 Qb8+ Nxb8 Rd8#'.split(' ')

describe('sanSimilarity', () => {
  it('ranks a neighbouring square of the same piece above an unrelated move', () => {
    expect(sanSimilarity('Bc5', 'Bc4')).toBeGreaterThan(sanSimilarity('Bc5', 'Nc3'))
    expect(sanSimilarity('Bc5', 'a3')).toBeLessThan(3)
  })
})

describe('findMoveRepair', () => {
  it('replaces an illegal move with the look-alike the continuation confirms', () => {
    const r = findMoveRepair({ startFen: START, played: OPERA.slice(0, 10), written: 'Bc5', upcoming: OPERA.slice(11) })
    expect(r).toMatchObject({ index: 10, written: 'Bc5', san: 'Bc4', confidence: 'high' })
    expect(r!.verifiedPlies).toBe(22)
  })

  it('finds a legal-but-wrong EARLIER move when a later move stops fitting', () => {
    // "3... Bf5" instead of "3... Bg4" is legal; it only breaks at "4... Bxf3".
    const played = [...OPERA.slice(0, 5), 'Bf5', OPERA[6]]
    const r = findMoveRepair({ startFen: START, played, written: 'Bxf3', upcoming: OPERA.slice(8) })
    expect(r).toMatchObject({ index: 5, written: 'Bf5', san: 'Bg4', confidence: 'high', alternatives: [] })
  })

  it('reports low confidence and the other repair when legality cannot decide', () => {
    // "2... d5" for "2... d6" breaks at "5... dxe5" — but "5... dxe4" also
    // keeps every later move legal.
    const played = [...OPERA.slice(0, 3), 'd5', ...OPERA.slice(4, 9)]
    const r = findMoveRepair({ startFen: START, played, written: 'dxe5', upcoming: OPERA.slice(10) })
    expect(r!.confidence).toBe('low')
    const all = [{ index: r!.index, san: r!.san }, ...r!.alternatives.map((a) => ({ index: a.index, san: a.san }))]
    expect(all).toContainEqual({ index: 3, san: 'd6' })
  })

  it('uses the written mate mark to choose the last move of the game', () => {
    const r = findMoveRepair({ startFen: START, played: OPERA.slice(0, 32), written: 'Re8#', upcoming: [] })
    expect(r).toMatchObject({ index: 32, san: 'Rd8#' })
  })

  it('returns null when nothing resembling the move makes the continuation legal', () => {
    const r = findMoveRepair({ startFen: START, played: ['e4', 'e5'], written: 'Qh7', upcoming: ['Nc6', 'Qa8'] })
    expect(r).toBeNull()
  })
})

describe('recognition repairs wrong moves in the mainline (algorithms 1 and 2)', () => {
  const TEXT = [
    '1. e4 e5 2. Nf3 d6 3. d4 Bf5 4. dxe5 Bxf3 5. Qxf3 dxe5 6. Bc5 Nf6 7. Qb3 Qe7',
    'Black defends f7.',
    '8. Nc3 c6 9. Bg4 b5 10. Nxb5 cxb5 11. Bxb5+ Nbd7 12. O-O-O Rd8 13. Rxd7 Rxd7 14. Rd1 Qe6 15. Bxd7+ Nxd7 16. Qb8+ Nxb8 17. Rd8#',
  ].join('\n')

  for (const algorithm of [1, 2] as const) {
    it(`algorithm ${algorithm}: plays the whole game with the corrected moves`, () => {
      const tree = recognizeGames(TEXT, { algorithm })[0].tree
      const main = tree.mainline.map((id) => tree.nodes.get(id)!)
      expect(main.map((n) => n.san)).toEqual(OPERA)
      expect(main[5]).toMatchObject({ san: 'Bg4', correctedFrom: 'Bf5' })
      expect(main[10]).toMatchObject({ san: 'Bc4', correctedFrom: 'Bc5' })
      expect(main[16]).toMatchObject({ san: 'Bg5', correctedFrom: 'Bg4' })
      expect(main.filter((n) => n.correctedFrom)).toHaveLength(3)
    })

    it(`algorithm ${algorithm}: reports each wrong move with its proposal`, () => {
      const tree = recognizeGames(TEXT, { algorithm })[0].tree
      const wrong = tree.errors.filter((e) => e.kind === 'wrong-move')
      expect(wrong.map((e) => [e.moveNumber, e.color, e.san, e.suggestion])).toEqual([
        [3, 'black', 'Bf5', 'Bg4'],
        [6, 'white', 'Bc5', 'Bc4'],
        [9, 'white', 'Bg4', 'Bg5'],
      ])
      // The source position of the written token is kept so the reader can jump to it.
      expect(TEXT.slice(wrong[1].charStart, wrong[1].charEnd)).toBe('Bc5')
    })
  }

  it('a correct game reports no wrong moves', () => {
    const clean = '1. e4 e5 2. Nf3 d6 3. d4 Bg4 4. dxe5 Bxf3 5. Qxf3 dxe5 6. Bc4 Nf6 7. Qb3 Qe7'
    const tree = recognizeGames(clean, { algorithm: 2 })[0].tree
    expect(tree.errors).toEqual([])
    expect([...tree.nodes.values()].some((n) => n.correctedFrom)).toBe(false)
  })
})
