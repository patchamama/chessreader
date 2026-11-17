import { describe, it, expect } from 'vitest'
import { Chess } from 'chess.js'
import { annotateGame, reviewGame, type PlyInput, type Score } from '../../teaching/gameReview.js'
import { recognizeGames } from '../../recognition/recognizeGames.js'

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
const game = plies('e4 e5 Qh5 Nc6 Bc4 Nf6 Qxf7#',
  [{ cp: 20 }, { cp: 25 }, { cp: 20 }, { cp: -40 }, { cp: -30 }, { cp: -35 }, { mate: 1 }, { mate: 1 }],
  { 5: { san: 'g6', line: ['g6', 'Qf3', 'Nf6'] } })
const review = reviewGame(game)
const mainline = (text: string) => {
  const [g] = recognizeGames(text, { algorithm: 2 })
  return { sans: g.tree.mainline.map((id) => g.tree.nodes.get(id)!.san), errors: g.tree.errors }
}
const MAIN = ['e4', 'e5', 'Qh5', 'Nc6', 'Bc4', 'Nf6', 'Qxf7#']

describe('commentary laid out like a book (S17)', () => {
  it('split: the line breaks after a commented move and the remark is its own paragraph', () => {
    const text = annotateGame(game, review, { level: 2, lang: 'es', layout: 'split' })
    const lines = text.split('\n')
    const at = lines.findIndex((l) => /3\. Ac4 Cf6\?\?$/.test(l))
    expect(at).toBeGreaterThan(0)
    expect(lines[at + 1]).toMatch(/^Error grave/)
    expect(text).not.toContain('{')
    expect(lines[at + 2]).toMatch(/^\(3\.\.\. g6/)
    expect(lines[at + 3]).toBe('4. Dxf7#')
    expect(mainline(text)).toEqual({ sans: MAIN, errors: [] })
  })

  it('paragraphs: a run of moves, then one paragraph with the remarks of those moves', () => {
    const text = annotateGame(game, review, { level: 2, lang: 'en', layout: 'paragraphs' })
    expect(text).not.toContain('{')
    expect(text).toMatch(/Move 3 \(Black\): Blunder/)
    expect(mainline(text)).toEqual({ sans: MAIN, errors: [] })
  })

  it('inline stays the default', () => {
    expect(annotateGame(game, review, { level: 2, lang: 'es' })).toContain('{ Error grave')
  })
})

describe('diagrams at the key moments (S18)', () => {
  it('puts a diagram mark after the big mistakes and the mate, with the evaluation when asked', () => {
    const text = annotateGame(game, review, { level: 2, lang: 'en', layout: 'split', diagrams: { key: true, eval: true } })
    const marks = [...text.matchAll(/^\[Diagram fen="([^"]+)"(?: eval="([^"]*)")?\]$/gm)]
    expect(marks.length).toBe(2)
    expect(marks[0][1]).toBe(game[5].fenAfter)
    expect(marks[0][2]).toMatch(/White/)
    expect(mainline(text)).toEqual({ sans: MAIN, errors: [] })
  })

  it('also after the moves the reader picked', () => {
    const text = annotateGame(game, review, { level: 1, lang: 'en', diagrams: { at: ['n2'] } })
    const marks = [...text.matchAll(/^\[Diagram fen="([^"]+)"/gm)]
    expect(marks.map((m) => m[1])).toEqual([game[2].fenAfter])
    expect(mainline(text)).toEqual({ sans: MAIN, errors: [] })
  })
})
