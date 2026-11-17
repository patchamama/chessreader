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

describe('German commentary writes German letters', () => {
  it('Sf3, Lb5 … and reads back', () => {
    const g = plies('e4 e5 Nf3 Nc6 Bb5 a6 Ba4 Nf6 O-O Be7', Array(11).fill({ cp: 20 }))
    const text = annotateGame(g, reviewGame(g), { level: 1, lang: 'de' })
    expect(text).toContain('2. Sf3 Sc6 3. Lb5')
    const [r] = recognizeGames(text, { algorithm: 2 })
    expect(r.tree.mainline.length).toBe(10)
  })
})

describe('diagrams as a book prints them (S34)', () => {
  const quiet = plies('e4 e5 Nf3 Nc6 Bb5 Nf6 O-O Nxe4 Re1 Nd6 Nxe5 Be7 Bf1 Nxe5 Rxe5 O-O d4 Bf6 Re1 Re8 c3 Rxe1 Qxe1 Ne8 Bf4 d6 Nd2 Bf5',
    Array.from({ length: 29 }, () => ({ cp: 20 })))
  const text = annotateGame(quiet, reviewGame(quiet), { level: 3, lang: 'es', layout: 'split', diagrams: { key: true, eval: true } })
  const marks = text.split('\n').filter((l) => l.startsWith('[Diagram'))
  it('the final position always gets a diagram, with its evaluation', () => {
    expect(text.trim().split('\n').at(-1)).toMatch(/^\[Diagram fen="[^"]+" eval="Evaluación: \+0\.2 \(igualdad\)"\]$/)
  })
  it('a quiet game still gets a diagram every 20 half-moves or so, on a commented move', () => {
    expect(marks.length).toBeGreaterThanOrEqual(2)
  })
  it('remarks sit on their own line, right after the move they speak of', () => {
    const lines = text.split('\n')
    const i = lines.findIndex((l) => /^5\. Te1/.test(l) || / 5\. Te1$/.test(l) || /5\. Te1$/.test(l))
    expect(i).toBeGreaterThan(0)
    expect(lines[i + 1]).toMatch(/semiabierta/)
  })
})

describe('diagrams like a book: the engine, its next moves and who is better (S9)', () => {
  // Diagram after 2...Nc6 (ply 3): the engine's line from there is ply 4's best line.
  const withLines = plies('e4 e5 Qh5 Nc6 Bc4 Nf6 Qxf7#',
    [{ cp: 20 }, { cp: 25 }, { cp: 20 }, { cp: -40 }, { cp: -30 }, { cp: -35 }, { mate: 1 }, { mate: 1 }],
    { 4: { san: 'Bc4', line: ['Bc4', 'g6', 'Qf3', 'Nf6'] }, 5: { san: 'g6', line: ['g6', 'Qf3', 'Nf6'] } })
  withLines[4].second = { san: 'Nf3', line: ['Nf3', 'd6'], score: { cp: -60 } }
  const r = reviewGame(withLines)

  it('the mark carries the engine with its depth, the evaluation in words, the next moves and an alternative', () => {
    const text = annotateGame(withLines, r, { level: 2, lang: 'es', layout: 'split', diagrams: { at: ['n3'], eval: true, engine: 'Stockfish 18', depth: 14 } })
    const mark = text.split('\n').find((l) => l.startsWith('[Diagram fen="r1bqkbnr/pppp1ppp/2n5'))
    expect(mark).toBe('[Diagram fen="r1bqkbnr/pppp1ppp/2n5/4p2Q/4P3/8/PPPP1PPP/RNB1KBNR w KQkq - 2 3" eval="Evaluación: −0.3 (igualdad) · Stockfish 18, prof. 14" line="3. Ac4 g6 4. Df3 Cf6" alt="3. Cf3 d6 (−0.6)"]')
  })

  it('the moves of the diagram lines are not read as moves of the game', () => {
    const text = annotateGame(withLines, r, { level: 2, lang: 'en', layout: 'split', diagrams: { at: ['n3'], eval: true, engine: 'Stockfish 18', depth: 14 } })
    expect(mainline(text).sans).toEqual(MAIN)
  })
})
