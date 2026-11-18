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

  it('paragraphs: move by move, each commented move on its own line followed by its remark, no "Move N (side):" labels (S9)', () => {
    const text = annotateGame(game, review, { level: 2, lang: 'en', layout: 'paragraphs' })
    expect(text).not.toContain('{')
    expect(text).not.toMatch(/Move \d+ \((White|Black)\):/)
    const lines = text.split('\n')
    // A full move, or Black's move alone after a remark on White's.
    const at = lines.findIndex((l) => /^(3\. Bc4 |3\.\.\. )Nf6\?\?$/.test(l))
    expect(at).toBeGreaterThan(0)
    expect(lines[at + 1]).toMatch(/^Blunder/)
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

describe('human comments borrowed from the books (S5)', () => {
  it('a book comment on the same position goes after the move, with where it comes from', () => {
    const text = annotateGame(game, review, {
      level: 2, lang: 'es', layout: 'split',
      human: { 4: { text: 'La dama sale demasiado pronto: "un error típico".', source: 'Kasparov, Mis geniales predecesores I, Partida 3' } },
    })
    const lines = text.split('\n')
    const at = lines.findIndex((l) => l.startsWith('[Comment '))
    expect(lines[at]).toBe(`[Comment source="Kasparov, Mis geniales predecesores I, Partida 3" text="La dama sale demasiado pronto: ”un error típico”." fen="${game[3].fenAfter}"]`)
    expect(lines.slice(0, at).join(' ')).toContain('Cc6')
    expect(lines.slice(0, at).join(' ')).not.toContain('Ac4')
  })
})

describe('human comments carry their position and where to open them (S5)', () => {
  it('the mark names the commentdb game and ply when known', () => {
    const text = annotateGame(game, review, {
      level: 1, lang: 'en', layout: 'split',
      human: { 4: { text: 'Better is 3. Bc4.', source: 'Book', gameId: 'g42', ply: 7 } },
    })
    const mark = text.split('\n').find((l) => l.startsWith('[Comment '))
    expect(mark).toBe(`[Comment source="Book" text="Better is 3. Bc4." fen="${game[3].fenAfter}" game="g42" ply="7"]`)
  })
})

describe('"Párrafo tras las jugadas" on the reported game (S9)', () => {
  const SOURCE = 'e4 e5 Nf3 Qf6 Bc4 Qg6 O-O Qxe4 Bxf7+ Ke7 Re1 Qf4 Rxe5+ Kxf7 d4 Qf6 Ng5+ Kg6 Qd3+ Kh5 g4+'
  const cps = [20, 30, 25, 30, 320, 300, 310, 300, 600, 650, 640, 700, 690, 900, 880, 900, 890, 950, 940, 1000, 990]
  const evals: Score[] = [...cps.map((cp) => ({ cp })), { mate: 3 }]
  const reported = plies(SOURCE, evals, { 3: { san: 'Nf6', line: ['Nf6', 'Nxe5', 'd6', 'Nf3'] }, 7: { san: 'Nf6', line: ['Nf6', 'Re1', 'Be7'] } })
  const text = annotateGame(reported, reviewGame(reported), { level: 3, lang: 'es', layout: 'paragraphs', diagrams: { key: true, eval: true } })
  const lines = text.split('\n')

  it('has no "Jugada N (blancas/negras):" labels', () => {
    expect(text).not.toMatch(/Jugada \d+ \((blancas|negras)\)/)
  })

  it('each commented move is on its own line, its remark on the next line', () => {
    const at = lines.indexOf('2... Df6?')
    expect(at).toBeGreaterThan(0)
    expect(lines[at + 1]).toMatch(/^Error/)
    expect(lines.some((l) => /^\(2\.\.\. Cf6 3\. Cxe5/.test(l))).toBe(true)
    // No line of moves holds more than one move number.
    for (const l of lines.filter((x) => /^\d+\.(\.\.)? /.test(x))) expect(l.match(/\d+\./g)!.length).toBe(1)
  })

  it('reads back as ONE game with the whole mainline: the remarks are not moves', () => {
    const games = recognizeGames(text, { algorithm: 2 })
    expect(games).toHaveLength(1)
    const sans = games[0].tree.mainline.map((id) => games[0].tree.nodes.get(id)!.san)
    expect(sans).toEqual(reported.map((p) => p.san))
    expect(sans).toHaveLength(21)
    expect(games[0].tree.errors).toEqual([])
  })
})
