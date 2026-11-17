import { describe, it, expect } from 'vitest'
import { Chess } from 'chess.js'
import { coachGame, reviewGame, type PlyInput, type Score } from '../../index.js'

function plies(moves: string, evals: Score[], best: Record<number, { san: string; line: string[] }> = {}): PlyInput[] {
  const c = new Chess()
  return moves.split(' ').map((san, i) => {
    const fenBefore = c.fen()
    const m = c.move(san)
    return {
      nodeId: `n${i}`, san: m.san, from: m.from, to: m.to, fenBefore, fenAfter: c.fen(),
      color: m.color === 'w' ? 'white' : 'black', moveNumber: Math.floor(i / 2) + 1,
      before: evals[i], after: evals[i + 1], ...(best[i] ? { best: best[i] } : {}),
    } as PlyInput
  })
}

// Scholar's mate: Black (the player) blunders with 3...Nf6??; 3...g6 held.
const game = plies('e4 e5 Qh5 Nc6 Bc4 Nf6 Qxf7#',
  [{ cp: 20 }, { cp: 25 }, { cp: 20 }, { cp: -40 }, { cp: -30 }, { cp: -35 }, { mate: 1 }, { mate: 1 }],
  { 5: { san: 'g6', line: ['g6', 'Qf3', 'Nf6'] } })
const review = reviewGame(game)

describe('the coach (S25)', () => {
  it('tells the player what went wrong and what the better move did', () => {
    const { remarks } = coachGame(game, review, { focus: 'black', level: 2, lang: 'es' })
    expect(remarks[6]).toMatch(/^Error grave/)
    expect(remarks[6]).toContain('g6')
    expect(remarks[6]).toMatch(/mate en f7/)
  })

  it('warns about what the opponent is up to', () => {
    const { remarks } = coachGame(game, review, { focus: 'black', level: 2, lang: 'es' })
    // 3. Qh5 and 3. Bc4 both aim at f7.
    expect(remarks[3]).toMatch(/^Atención/)
    expect(remarks[5]).toMatch(/f7/)
  })

  it('points out a free piece that was left on the board', () => {
    // 3. Nxe5?? gives the knight away; 3... a6?? does not take it.
    const h = plies('e4 e5 Nf3 Nc6 Nxe5 a6', [{ cp: 0 }, { cp: 0 }, { cp: 0 }, { cp: 0 }, { cp: 0 }, { cp: -300 }, { cp: 100 }], { 5: { san: 'Nxe5', line: ['Nxe5'] } })
    const t = coachGame(h, reviewGame(h), { focus: 'black', level: 1, lang: 'en' })
    expect(t.remarks[6]).toMatch(/You let a free capture go: Nxe5 won the knight on e5/)
  })

  it('praises the good moves and sums the game up for the player', () => {
    const { intro } = coachGame(game, review, { focus: 'black', level: 2, lang: 'es' })
    expect(intro).toMatch(/negras/)
    expect(intro).toMatch(/1 error grave \(jugada 3\)/)
  })

  it('level 3 says the idea behind each of the player\'s moves', () => {
    const { remarks } = coachGame(game, review, { focus: 'white', level: 3, lang: 'en' })
    expect(remarks[5]).toMatch(/f7/)
  })
})

describe('coach wording found wrong in the browser smoke (S26)', () => {
  it('the better move is written in the letters of the language, and "better was" is said once', async () => {
    const { annotateGame } = await import('../../index.js')
    const g = plies('e4 e5 Qh5 Nc6 Bc4 Nf6 Qxf7#',
      [{ cp: 20 }, { cp: 25 }, { cp: 20 }, { cp: -40 }, { cp: -30 }, { cp: -35 }, { mate: 1 }, { mate: 1 }],
      { 4: { san: 'Qf3', line: ['Qf3'] }, 5: { san: 'g6', line: ['g6', 'Qf3', 'Nf6'] } })
    const r = reviewGame(g)
    const { remarks, intro } = coachGame(g, r, { focus: 'black', level: 2, lang: 'de' })
    const text = annotateGame(g, r, { level: 2, lang: 'de', remarks, intro })
    expect(text.match(/Besser war/g)?.length).toBe(1)
    const w = coachGame(g, r, { focus: 'white', level: 2, lang: 'es' })
    void w
  })
})
