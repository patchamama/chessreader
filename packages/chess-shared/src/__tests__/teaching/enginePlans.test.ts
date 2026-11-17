import { describe, it, expect } from 'vitest'
import { Chess } from 'chess.js'
import { motifText, reviewGame, type PlyInput, type Score } from '../../teaching/gameReview.js'

type Extra = { best?: { san: string; line: string[] }; second?: { san: string; line: string[]; score: Score } }
function plies(moves: string, extra: Record<number, Extra> = {}, scores: Record<number, Score> = {}): PlyInput[] {
  const c = new Chess()
  const list = moves.split(' ')
  return list.map((san, i) => {
    const fenBefore = c.fen()
    const m = c.move(san)
    return {
      nodeId: `n${i}`, san: m.san, from: m.from, to: m.to, fenBefore, fenAfter: c.fen(),
      color: m.color === 'w' ? 'white' : 'black', moveNumber: Math.floor(i / 2) + 1,
      before: scores[i] ?? { cp: 20 }, after: scores[i + 1] ?? { cp: 20 }, ...extra[i],
    } as PlyInput
  })
}

describe('moves not played, from the engine (S31)', () => {
  it('the only good move: the engine\'s second choice loses, and the remark shows why', () => {
    // 3. Bc4: 3... g6 is forced-ish; 3... Nf6?? loses to Qxf7#.
    const p = plies('e4 e5 Qh5 Nc6 Bc4 g6', {
      5: { best: { san: 'g6', line: ['g6', 'Qf3', 'Nf6'] }, second: { san: 'Qe7', line: ['Qe7', 'Nc3', 'Nf6'], score: { cp: 300 } } },
    })
    const r = reviewGame(p)
    const only = r.moves[5].motifs.find((m) => m.kind === 'only-move')
    expect(only).toBeDefined()
    expect(motifText(only!, p[5].fenAfter, 'es')).toBe('La única jugada buena: si 3... De7?, 4. Cc3 Cf6.')
    expect(motifText(only!, p[5].fenAfter, 'en')).toBe('The only good move: if 3... Qe7?, 4. Nc3 Nf6.')
  })
  it('no "only move" when the second choice is about as good', () => {
    const p = plies('e4 e5 Qh5 Nc6 Bc4 g6', {
      5: { best: { san: 'g6', line: ['g6'] }, second: { san: 'Qe7', line: ['Qe7', 'Nc3'], score: { cp: 40 } } },
    })
    expect(reviewGame(p).moves[5].motifs.some((m) => m.kind === 'only-move')).toBe(false)
  })
  it('the plan the engine sees after a quiet move, and whether the game carries it out', () => {
    // After 3. d3 the engine's line has White bring the knight round: Nbd2 and Nc4.
    const done = plies('e4 e5 Nf3 Nc6 d3 Nf6 Nbd2 d5 Nc4', { 5: { best: { san: 'Nf6', line: ['Nf6', 'Nbd2', 'd5', 'Nc4'] } } })
    const plan = reviewGame(done).moves[4].motifs.find((m) => m.kind === 'plan')
    expect(plan).toBeDefined()
    expect(motifText(plan!, done[4].fenAfter, 'es')).toBe('Plan: 3... Cf6 4. Cbd2 d5 5. Cc4; se cumple en la jugada 5.')
    const not = plies('e4 e5 Nf3 Nc6 d3 Nf6 Be2 d5 O-O', { 5: { best: { san: 'Nf6', line: ['Nf6', 'Nbd2', 'd5', 'Nc4'] } } })
    const plan2 = reviewGame(not).moves[4].motifs.find((m) => m.kind === 'plan')!
    expect(motifText(plan2, not[4].fenAfter, 'en')).toBe('Plan: 3... Nf6 4. Nbd2 d5 5. Nc4; the game does not carry it out.')
  })
  it('no plan for a capture or a check, nor when the engine line has no manoeuvre', () => {
    const p = plies('e4 e5 Nf3 Nc6 d3 Nf6', { 5: { best: { san: 'Nf6', line: ['Nf6', 'Be2', 'd5', 'O-O'] } } })
    expect(reviewGame(p).moves[4].motifs.some((m) => m.kind === 'plan')).toBe(false)
  })
})

describe('only the moments worth it (real-engine run on Kasparov III and Bronstein)', () => {
  it('no "only move" when the game is already decided', () => {
    const p = plies('e4 e5 Qh5 Nc6 Bc4 g6', {
      5: { best: { san: 'g6', line: ['g6'] }, second: { san: 'Qe7', line: ['Qe7', 'Nc3'], score: { cp: 900 } } },
    }, { 5: { cp: 600 }, 6: { cp: 600 } })
    expect(reviewGame(p).moves[5].motifs.some((m) => m.kind === 'only-move')).toBe(false)
  })
  it('no plan when the piece only steps back from an attack, or when the line captures', () => {
    // After 3. d3 Black attacks the knight and it goes back: a reaction, not a plan.
    const chased = plies('e4 e5 Nf3 Nc6 d3 h6', { 5: { best: { san: 'Nf6', line: ['Nf6', 'Ng5', 'h6', 'Nf3'] } } })
    expect(reviewGame(chased).moves[4].motifs.some((m) => m.kind === 'plan')).toBe(false)
    const takes = plies('e4 e5 Nf3 Nc6 d3 h6', { 5: { best: { san: 'Nf6', line: ['Nf6', 'Nh4', 'd5', 'Nf5'] } } })
    expect(reviewGame(takes).moves[4].motifs.some((m) => m.kind === 'plan')).toBe(true)
    const capture = plies('e4 e5 Nf3 Nc6 d3 h6', { 5: { best: { san: 'Nf6', line: ['Nf6', 'Ng5', 'd5', 'Nxf7'] } } })
    expect(reviewGame(capture).moves[4].motifs.some((m) => m.kind === 'plan')).toBe(false)
  })
  it('Spanish agrees with the piece: "la torre colocada aquí será decisiva"', async () => {
    const { motifText: text } = await import('../../teaching/gameReview.js')
    expect(text({ kind: 'late-value', square: 'e1', squares: [], data: { piece: 'r', move: 41 } }, '4k3/8/8/8/8/8/8/4RK2 b - - 0 1', 'es'))
      .toBe('Parece una jugada modesta, pero la torre colocada aquí será decisiva en la jugada 41.')
    expect(text({ kind: 'late-value', square: 'e1', squares: [], data: { piece: 'n', move: 41 } }, '4k3/8/8/8/8/8/8/4NK2 b - - 0 1', 'es'))
      .toBe('Parece una jugada modesta, pero el caballo colocado aquí será decisivo en la jugada 41.')
  })
})

describe('density, as in a book', () => {
  it('"the only good move" at most once every 8 half-moves', () => {
    const line = 'e4 e5 Nf3 Nc6 Bc4 Bc5 c3 Nf6 d4 exd4'
    const extra: Record<number, Extra> = {}
    line.split(' ').forEach((san, i) => { extra[i] = { best: { san, line: [san] }, second: { san: 'a3', line: ['a3', 'a6'], score: { cp: i % 2 ? 400 : -400 } } } })
    // Every move here would qualify; only every 8th one is said.
    const p = plies(line, extra)
    // a3 is not legal everywhere, but the remark only reads the line given.
    const said = reviewGame(p).moves.map((m, i) => (m.motifs.some((x) => x.kind === 'only-move') ? i : -1)).filter((i) => i >= 0)
    expect(said).toEqual([0, 8])
  })
  it('no plan on a move the engine faults: "Better was" says what matters there', () => {
    const p = plies('e4 e5 Nf3 Nc6 d3 Nf6 Nbd2 d5 Nc4', { 4: { best: { san: 'd4', line: ['d4'] } }, 5: { best: { san: 'Nf6', line: ['Nf6', 'Nbd2', 'd5', 'Nc4'] } } },
      { 4: { cp: 60 }, 5: { cp: -200 } })
    expect(reviewGame(p).moves[4].motifs.some((m) => m.kind === 'plan')).toBe(false)
  })
})

describe('Spanish: "se suma al ataque de la torre"', () => {
  it('a feminine piece takes "de la"', async () => {
    const { motifText: text } = await import('../../teaching/gameReview.js')
    const fen = '4k3/8/8/pR6/Q7/8/8/4K3 b - - 0 1'
    expect(text({ kind: 'joint-attack', square: 'a4', squares: ['a5', 'a4', 'b5'], data: { prior: 'b5' } }, fen, 'es')).toBe('La dama se suma al ataque de la torre de b5 sobre el peón de a5.')
  })
})

describe('Spanish: "se suma al ataque" with two pieces', () => {
  it('"del alfil … y de la torre" reads right', async () => {
    const { motifText: text } = await import('../../teaching/gameReview.js')
    const fen = '4k3/8/8/pR6/Q7/8/6B1/4K3 b - - 0 1'
    expect(text({ kind: 'joint-attack', square: 'a4', squares: ['a5', 'a4'], data: { prior: 'g2,b5' } }, fen, 'es'))
      .toMatch(/^La dama se suma al ataque del alfil de g2 y la torre de b5 sobre/)
  })
})
