import { describe, it, expect } from 'vitest'
import { Chess } from 'chess.js'
import { annotateGame, recognizeGames, reviewGame, type PlyInput, type Score } from '@chess-ebook/chess-shared'
import { textToChapters } from './textToChapters'
import { extractProseText } from './proseText'

describe('textToChapters', () => {
  it('turns pasted prose into one chapter, a paragraph per block of text', () => {
    const { title, chapters } = textToChapters('La partida de la Ópera\n\n1. e4 e5 2. Cf3 d6\nUna defensa <sólida>.')
    expect(title).toBe('La partida de la Ópera')
    expect(chapters).toHaveLength(1)
    expect(chapters[0].html).toBe('<p>La partida de la Ópera</p>\n<p>1. e4 e5 2. Cf3 d6</p>\n<p>Una defensa &lt;sólida&gt;.</p>')
  })

  it('reads pasted PGN as one chapter per game', () => {
    const pgn = '[Event "A"]\n[White "Morphy"]\n[Black "Duke"]\n\n1. e4 e5 *\n\n[Event "B"]\n[White "Anderssen"]\n[Black "Kieseritzky"]\n\n1. e4 e5 2. f4 *'
    const { chapters } = textToChapters(pgn)
    expect(chapters.map((c) => c.title)).toEqual(['Morphy — Duke', 'Anderssen — Kieseritzky'])
  })

  it('uses the given title and refuses empty text', () => {
    expect(textToChapters('1. e4 e5', 'My game').title).toBe('My game')
    expect(textToChapters('   ').chapters).toEqual([])
  })
})

const fenAfter = (moves: string) => {
  const c = new Chess()
  for (const m of moves.split(' ')) c.move(m)
  return c.fen()
}
const dom = (html: string) => {
  const div = document.createElement('div')
  div.innerHTML = html
  return div
}
const readBack = (html: string) => recognizeGames(extractProseText(dom(html)).text, { algorithm: 2 })

describe('generated commentary: lines in variations, evaluations and book comments (S5, S9)', () => {
  const D = fenAfter('e4 e5 Nf3 Qf6')
  const C = fenAfter('e4 e5 Nf3 Qf6 Bc4')
  const TEXT = [
    'T',
    '1. e4',
    'Lucha por e4.',
    '1... e5',
    '2. Cf3',
    '2... Df6?',
    'Error: deja la partida perdida. Era mejor:',
    '(2... Cf6 3. Cxe5 d6 4. Cf3)',
    `[Diagram fen="${D}" eval="Evaluación: +3.2 (ventaja de las blancas)" line="3. Ac4 Dg6 4. O-O" alt="3. Cc3 c6 (+3.0)"]`,
    '3. Ac4',
    `[Comment source="Kasparov, Partida 3" text="Aquí 3... Dg6 4. O-O Dxe4 es arriesgado; 1. Dh5 no." fen="${C}" game="g42" ply="5"]`,
    '3... Dg6',
  ].join('\n')
  const html = textToChapters(TEXT).chapters[0].html
  const div = dom(html)

  it('a variation is a playable line from the position before the move it replaces, outside the game', () => {
    const line = div.querySelector('[data-no-recognition] span.chess-line[data-line-moves="Nf6 Nxe5 d6 Nf3"]')
    expect(line).not.toBeNull()
    expect(line!.getAttribute('data-line-start')).toBe(fenAfter('e4 e5 Nf3'))
    expect(line!.querySelectorAll('span.line-move')).toHaveLength(4)
  })

  it('the evaluation under a diagram has a button that takes its line to an analysis board', () => {
    const button = div.querySelector('p.diagram-eval button.line-to-board')!
    expect(button.getAttribute('data-line-start')).toBe(D)
    expect(button.getAttribute('data-line-moves')).toBe('Bc4 Qg6 O-O')
    expect(div.querySelector('p.diagram-eval')!.textContent).toContain('Evaluación: +3.2')
  })

  it('the engine line and the alternative under the diagram are playable lines', () => {
    expect(div.querySelector('p.diagram-line:not(.diagram-alt) .chess-line')!.getAttribute('data-line-moves')).toBe('Bc4 Qg6 O-O')
    expect(div.querySelector('p.diagram-alt .chess-line')!.getAttribute('data-line-moves')).toBe('Nc3 c6')
  })

  it('a book comment marks the moves it quotes that can be played there, and links to its source', () => {
    const quote = div.querySelector('blockquote.human-comment')!
    const lines = [...quote.querySelectorAll('.chess-line')]
    expect(lines.map((l) => [l.getAttribute('data-line-start'), l.getAttribute('data-line-moves')])).toEqual([[C, 'Qg6 O-O Qxe4']])
    expect(quote.querySelector('p')!.textContent).toBe('Aquí 3... Dg6 4. O-O Dxe4 es arriesgado; 1. Dh5 no.')
    const link = quote.querySelector('a.comment-source')!
    expect(link.getAttribute('data-comment-game')).toBe('g42')
    expect(link.getAttribute('data-comment-ply')).toBe('5')
    expect(link.getAttribute('href')).toBe('#')
  })

  it('the reader still reads one game with its moves only', () => {
    const games = readBack(html)
    expect(games).toHaveLength(1)
    expect(games[0].tree.mainline.map((id) => games[0].tree.nodes.get(id)!.san)).toEqual(['e4', 'e5', 'Nf3', 'Qf6', 'Bc4', 'Qg6'])
  })

  it('a comment without position or source link stays as before', () => {
    const plain = textToChapters('T\n[Comment source="S" text="Una idea."]').chapters[0].html
    expect(plain).toContain('<blockquote class="human-comment" data-no-recognition><p>Una idea.</p><footer>— S</footer></blockquote>')
  })
})

describe('the reported game, regenerated as "Párrafo tras las jugadas" (S9)', () => {
  const SOURCE = 'e4 e5 Nf3 Qf6 Bc4 Qg6 O-O Qxe4 Bxf7+ Ke7 Re1 Qf4 Rxe5+ Kxf7 d4 Qf6 Ng5+ Kg6 Qd3+ Kh5 g4+'.split(' ')
  const cps = [20, 30, 25, 30, 320, 300, 310, 300, 600, 650, 640, 700, 690, 900, 880, 900, 890, 950, 940, 1000, 990]
  const evals: Score[] = [...cps.map((cp) => ({ cp })), { mate: 3 }]
  const best: Record<number, { san: string; line: string[] }> = { 3: { san: 'Nf6', line: ['Nf6', 'Nxe5', 'd6', 'Nf3'] } }
  const c = new Chess()
  const plies = SOURCE.map((san, i) => {
    const fenBefore = c.fen()
    const m = c.move(san)
    return {
      nodeId: `n${i}`, san: m.san, from: m.from, to: m.to, fenBefore, fenAfter: c.fen(), color: m.color === 'w' ? 'white' : 'black',
      moveNumber: Math.floor(i / 2) + 1, before: evals[i], after: evals[i + 1], ...(best[i] ? { best: best[i] } : {}),
    } as PlyInput
  })
  const text = annotateGame(plies, reviewGame(plies), { level: 3, lang: 'es', layout: 'paragraphs', diagrams: { key: true, eval: true, engine: 'Stockfish 18', depth: 14 } })
  const html = textToChapters(text).chapters[0].html

  it('the book reads back as ONE game with the whole mainline; remarks, variations and evaluations are not moves', () => {
    const games = readBack(html)
    expect(games).toHaveLength(1)
    const sans = games[0].tree.mainline.map((id) => games[0].tree.nodes.get(id)!.san)
    expect(sans).toEqual(plies.map((p) => p.san))
    expect(sans).toHaveLength(21)
  })

  it('the better line after 2... Df6? is a playable line', () => {
    expect(dom(html).querySelector('.chess-line[data-line-moves="Nf6 Nxe5 d6 Nf3"]')!.getAttribute('data-line-start')).toBe(plies[3].fenBefore)
  })
})

describe('book comments with alternatives (S4)', () => {
  it('keeps every remark of the position on the quote, so the reader can pick another one', async () => {
    const { commentAlternativesAttr } = await import('./diagramMark')
    const alts = [{ text: 'Idea one.', source: 'A' }, { text: 'Idea two.', source: 'B', gameId: 'g2', ply: 3 }]
    const html = textToChapters(`T\n[Comment source="A" text="Idea one."${commentAlternativesAttr(alts)}]`).chapters[0].html
    const quote = new DOMParser().parseFromString(html, 'text/html').querySelector('blockquote.human-comment')!
    expect(quote.querySelector('p')!.textContent).toBe('Idea one.')
    expect(JSON.parse(quote.getAttribute('data-comment-alternatives')!)).toEqual(alts)
  })

  it('textToHtml renders text as the paragraphs of a chapter', async () => {
    const { textToHtml } = await import('./textToChapters')
    expect(textToHtml('1. e4 e5\nA remark.')).toBe('<p>1. e4 e5</p>\n<p>A remark.</p>')
  })
})

describe('book comments read the moves they quote against the main line (reader-analysis-round S7)', () => {
  it('"5…Nc6" in English letters inside a Spanish game is read from the position before Black\'s 5th move', () => {
    const c = new Chess()
    for (const m of ['d4', 'd5', 'c4', 'e6', 'Nc3', 'c5', 'Nf3', 'Nf6', 'e3', 'Be7', 'Bd3', 'Nc6', 'O-O']) c.move(m)
    const text = [
      'T',
      '1. d4 d5 2. c4 e6 3. Cc3 c5 4. Cf3 Cf6 5. e3 Ae7 6. Ad3 Cc6 7. O-O',
      `[Comment source="Kasparov, Mis geniales predecesores I" text="Staunton elude la Variante Simétrica, con 5…Nc6. 6" fen="${c.fen()}" game="g7" ply="13"]`,
    ].join('\n')
    const html = textToChapters(text).chapters[0].html
    const quote = html.slice(html.indexOf('<blockquote'))
    expect(quote).toMatch(/class="chess-line"[^>]*data-line-moves="Nc6"/)
    expect(quote).toContain('>Nc6<')
  })
})
