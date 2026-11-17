import { describe, it, expect } from 'vitest'
import { Chess } from 'chess.js'
import {
  winPercent, moveAccuracy, reviewGame, moveMotifs, annotateGame, openingName, extractPlayers,
  type PlyInput, type Score,
} from '../../teaching/gameReview.js'
import { recognizeGames } from '../../recognition/recognizeGames.js'

/** Plies of a game with the evaluations given per position (White's view, index 0 = start). */
function plies(moves: string, evals: Score[], best: Record<number, { san: string; line: string[] }> = {}): PlyInput[] {
  const c = new Chess()
  return moves.split(' ').map((san, i) => {
    const fenBefore = c.fen()
    const m = c.move(san)
    return {
      nodeId: `n${i}`, san: m.san, color: m.color === 'w' ? 'white' : 'black', moveNumber: Math.floor(i / 2) + 1,
      from: m.from, to: m.to, fenBefore, fenAfter: c.fen(), before: evals[i], after: evals[i + 1], best: best[i],
    } as PlyInput
  })
}

describe('win percentage and accuracy', () => {
  it('maps centipawns and mates to a win percentage for White', () => {
    expect(winPercent({ cp: 0 })).toBe(50)
    expect(winPercent({ cp: 300 })).toBeGreaterThan(74)
    expect(winPercent({ cp: 300 })).toBeLessThan(76)
    expect(winPercent({ mate: 3 })).toBe(100)
    expect(winPercent({ mate: -2 })).toBe(0)
  })
  it('a move that loses nothing is 100% accurate; a blunder is far below', () => {
    expect(moveAccuracy(0)).toBe(100)
    expect(moveAccuracy(40)).toBeLessThan(20)
  })
})

describe('reviewGame', () => {
  // 1. e4 e5 2. Qh5 Nc6 3. Bc4 Nf6?? 4. Qxf7#
  const game = plies('e4 e5 Qh5 Nc6 Bc4 Nf6 Qxf7#',
    [{ cp: 20 }, { cp: 25 }, { cp: 20 }, { cp: -40 }, { cp: -30 }, { cp: -35 }, { mate: 1 }, { mate: 1 }],
    { 5: { san: 'g6', line: ['g6', 'Qf3', 'Nf6'] } })
  const review = reviewGame(game)

  it('rates each player against the engine', () => {
    expect(review.white.accuracy).toBeGreaterThan(85)
    expect(review.black.accuracy).toBeLessThan(review.white.accuracy)
    expect(review.black.blunders).toBe(1)
    expect(review.white.blunders).toBe(0)
  })
  it('classifies the move that throws the game away and keeps the better move', () => {
    const nf6 = review.moves[5]
    expect(nf6.quality).toBe('blunder')
    expect(nf6.best!.san).toBe('g6')
    expect(review.moves[0].quality).toBeUndefined()
  })
  it('lists the key moments, most recent swing included, with their node', () => {
    expect(review.keyMoments.map((k) => k.nodeId)).toContain('n5')
    const k = review.keyMoments.find((m) => m.nodeId === 'n5')!
    expect(k.swing).toBeLessThan(-30)
    expect(k.line).toEqual(['g6', 'Qf3', 'Nf6'])
  })
})

describe('moveMotifs', () => {
  const kinds = (fen: string, san: string) => moveMotifs(fen, san).map((m) => m.kind)
  it('finds a fork', () => {
    const m = moveMotifs('r3k3/8/8/3N4/8/8/8/4K3 w - - 0 1', 'Nc7+').find((x) => x.kind === 'fork')!
    expect(m.squares.sort()).toEqual(['a8', 'e8'])
  })
  it('finds a pin and a skewer', () => {
    expect(kinds('4k3/8/2n5/8/8/8/8/4KB2 w - - 0 1', 'Bb5')).toContain('pin')
    expect(kinds('8/8/8/k7/8/qN6/8/5RK1 w - - 0 1', 'Ra1')).toContain('pin')
    expect(kinds('3r4/8/8/3k4/8/8/8/R3K3 w - - 0 1', 'Rd1+')).toContain('skewer')
  })
  it('finds a sacrifice, an exchange sacrifice and a discovered check', () => {
    expect(kinds('r1bqk2r/pppp1ppp/2n2n2/2b1p3/2B1P3/5N2/PPPP1PPP/RNBQ1RK1 w kq - 0 1', 'Bxf7+')).toContain('sacrifice')
    expect(kinds('6k1/5ppp/8/8/8/2n5/5PPP/2R3K1 w - - 0 1', 'Rxc3')).not.toContain('sacrifice')
    expect(kinds('6k1/5ppp/8/8/8/2n5/1b3PPP/2R3K1 w - - 0 1', 'Rxc3')).toContain('exchange-sacrifice')
    expect(kinds('4k3/8/8/8/8/4N3/8/4RK2 w - - 0 1', 'Nc4+')).toContain('discovered-check')
  })
})

describe('annotateGame', () => {
  const game = plies('e4 e5 Qh5 Nc6 Bc4 Nf6 Qxf7#',
    [{ cp: 20 }, { cp: 25 }, { cp: 20 }, { cp: -40 }, { cp: -30 }, { cp: -35 }, { mate: 1 }, { mate: 1 }],
    { 5: { san: 'g6', line: ['g6', 'Qf3', 'Nf6'] } })
  const review = reviewGame(game)

  it('writes a text the reader recognises with the same mainline and the better line as a variation', () => {
    const text = annotateGame(game, review, { level: 3, lang: 'en', white: 'A', black: 'B' })
    const [parsed] = recognizeGames(text, { algorithm: 2 })
    expect(parsed.tree.mainline.map((id) => parsed.tree.nodes.get(id)!.san)).toEqual(['e4', 'e5', 'Qh5', 'Nc6', 'Bc4', 'Nf6', 'Qxf7#'])
    expect([...parsed.tree.nodes.values()].some((n) => n.san === 'g6')).toBe(true)
    expect(parsed.tree.errors).toEqual([])
    expect(text).toContain('3... Nf6??')
    expect(text).toContain('Blunder')
  })
  it('level 1 only marks the moves; languages differ', () => {
    const l1 = annotateGame(game, review, { level: 1, lang: 'es' })
    expect(l1).toContain('Cf6??')
    expect(l1).not.toContain('(3... g6')
    expect(annotateGame(game, review, { level: 2, lang: 'es' })).toContain('Error grave')
    expect(annotateGame(game, review, { level: 2, lang: 'de' })).toContain('Grober Fehler')
  })
  it('opens with what mattered in the game', () => {
    const text = annotateGame(game, review, { level: 3, lang: 'en', white: 'A', black: 'B' })
    expect(text.split('\n')[0]).toContain('A – B')
    expect(text).toMatch(/Accuracy: White \d+%, Black \d+%/)
  })
})

describe('commentary quality', () => {
  it('writes the moves in Spanish letters for Spanish commentary', () => {
    const game = plies('e4 e5 Nf3 Nc6 Bb5', [{ cp: 20 }, { cp: 20 }, { cp: 20 }, { cp: 20 }, { cp: 20 }, { cp: 20 }])
    const text = annotateGame(game, reviewGame(game), { level: 1, lang: 'es' })
    expect(text).toContain('2. Cf3 Cc6 3. Ab5')
    const [parsed] = recognizeGames(text, { algorithm: 2 })
    expect(parsed.tree.mainline.length).toBe(5)
  })
  it('a piece that can simply be taken does not fork anything', () => {
    // Bxf3 "attacks" queen d1 and pawn e4 but is recaptured at once.
    const fen = 'rn1qkbnr/ppp2ppp/3p4/4P3/4P1b1/5N2/PPP2PPP/RNBQKB1R b KQkq - 0 4'
    expect(moveMotifs(fen, 'Bxf3').map((m) => m.kind)).not.toContain('fork')
  })
  it('the better line is given inside the remark, not in a second one', () => {
    const game = plies('e4 e5 Qh5 Nc6 Bc4 Nf6 Qxf7#',
      [{ cp: 20 }, { cp: 25 }, { cp: 20 }, { cp: -40 }, { cp: -30 }, { cp: -35 }, { mate: 1 }, { mate: 1 }],
      { 5: { san: 'g6', line: ['g6', 'Qf3', 'Nf6'] } })
    const text = annotateGame(game, reviewGame(game), { level: 2, lang: 'en' })
    expect(text).toContain('{ Blunder: leaves a lost game. Better was: } (3... g6 4. Qf3 Nf6)')
  })
})

describe('openingName and extractPlayers', () => {
  it('names the opening by its longest known line', () => {
    expect(openingName(['e4', 'e5', 'Nf3', 'Nc6', 'Bb5'], 'en')).toBe('Ruy Lopez')
    expect(openingName(['e4', 'e5', 'Nf3', 'Nc6', 'Bb5'], 'es')).toBe('Apertura Española')
    expect(openingName(['e4', 'c5'], 'de')).toBe('Sizilianische Verteidigung')
    expect(openingName(['a3'], 'en')).toBeNull()
  })
  it('reads the players from PGN tags, a heading line or labels', () => {
    expect(extractPlayers('[White "Morphy, Paul"]\n[Black "Duke Karl"]\n\n1. e4')).toEqual({ white: 'Morphy, Paul', black: 'Duke Karl' })
    expect(extractPlayers('Anderssen – Kieseritzky, Londres 1851\n1. e4 e5')).toEqual({ white: 'Anderssen', black: 'Kieseritzky' })
    expect(extractPlayers('Blancas: Capablanca\nNegras: Marshall\n1. e4')).toEqual({ white: 'Capablanca', black: 'Marshall' })
    expect(extractPlayers('1. e4 e5')).toEqual({ white: null, black: null })
  })
})
