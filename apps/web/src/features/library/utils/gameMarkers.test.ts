import { describe, it, expect } from 'vitest'
import { recognizeGames } from '@chess-ebook/chess-shared'
import { applyGameLayouts, clearGameDecorations, decorateGames, describeGames, gameStart } from './gameMarkers'
import { extractProseText, htmlToProseText } from './proseText'

const HTML = `<p>Some introduction long enough to be prose and not a heading line of the game at all, really.</p>
<p>Partida 149</p><p>M. Euwe-R. Réti</p><p>Defensa Caro-Kann (B10)</p>
<p>1. e4 c6 2. d4 d5 { A solid choice. } 3. Nc3 dxe4</p>
<p>Closing prose that follows the game and is long enough to never be read as a heading line.</p>`

const games = (html: string) => {
  const text = htmlToProseText(html)
  return { text, games: recognizeGames(text, { algorithm: 2 }) }
}

describe('gameMarkers', () => {
  it('summarises a game from its heading', () => {
    const { text, games: g } = games(HTML)
    const [s] = describeGames(text, g)
    expect(s.label).toBe('Game 149 · Euwe – Réti')
    expect(s.title).toBe('149 · M. Euwe – R. Réti · Defensa Caro-Kann (B10)')
    expect(text.slice(s.headingStart, s.headingStart + 11)).toBe('Partida 149')
    expect(text.slice(gameStart(text, g[0]), gameStart(text, g[0]) + 5)).toBe('1. e4')
    expect(s.braces).toBe(true)
  })

  it('falls back to the position in the chapter without a heading', () => {
    const { text, games: g } = games('<p>1. d4 d5 2. c4</p>')
    expect(describeGames(text, g)[0]).toMatchObject({ label: 'Game 1', title: '1', header: null })
  })

  it('rewrites only the chosen game and returns the html untouched otherwise', () => {
    const { games: g } = games(HTML)
    expect(applyGameLayouts(HTML, g, {})).toBe(HTML)
    expect(applyGameLayouts(HTML, g, { 0: 'braces' })).toBe(HTML)
    const out = applyGameLayouts(HTML, g, { 0: 'paragraphs' })
    const text = htmlToProseText(out)
    expect(text).toContain('1. e4 c6 2. d4 d5\nA solid choice.\n3. Nc3 dxe4')
    expect(text).toContain('Partida 149\nM. Euwe-R. Réti')
    expect(text.startsWith('Some introduction')).toBe(true)
  })

  it('frames a game without changing its text, and clears the frame', () => {
    const { games: g } = games(HTML)
    const root = document.createElement('div')
    root.innerHTML = HTML
    const prose = extractProseText(root)
    decorateGames(root, prose, g, describeGames(prose.text, g), { chapter: 3 })
    expect(root.querySelector('#game-3-0')?.getAttribute('data-game-marker')).toBe('start')
    expect(root.querySelectorAll('[data-game-region]').length).toBe(1)
    expect(extractProseText(root).text).toBe(prose.text)
    clearGameDecorations(root)
    expect(root.querySelector('[data-game-marker], [data-game-region], .game-heading-line')).toBeNull()
    expect(extractProseText(root).text).toBe(prose.text)
  })
})

describe('game headings in "Mis geniales predecesores I", Capítulo dos (S7)', () => {
  const p = (lines: string[]) => lines.map((l) => `<p>${l}</p>`).join('\n')

  it('finds the heading of a game that follows another game', () => {
    const html = p([
      '1 f4 d5 2 e3 Cf6 3 b3?!',
      'El comienzo del duelo fue intrigante y dramático. En la primera partida, Lasker superó a su oponente.',
      'Partida 37',
      'E. Lasker-W. Steinitz',
      'EEUU-Canadá 1894',
      'Campeonato Mundial, Match, 7ª partida',
      'Apertura Española (C62)',
      '1 e4 e5 2 Cf3 Cc6 3 Ab5 d6 4 d4 Ad7 5 Cc3 Cge7',
      'La Defensa Steinitz propiamente dicha.',
    ])
    const { text, games: g } = games(html)
    const s = describeGames(text, g)[1]
    expect(s.header).toMatchObject({ number: 37, white: 'E. Lasker', black: 'W. Steinitz', eco: 'C62' })
    expect(text.slice(s.headingStart, s.headingStart + 10)).toBe('Partida 37')
  })

  it.each([
    ['Partida 39', ['S. Tarrasch-E. Lasker', 'Hastings 1895, 19ª ronda', '3b4/pp6/8/8/2k1K1P1/2p5/P3N2P/8 w - - 0 1', '<img alt="" src="d.jpg">',
      'Stockfish 13 eval: [-0.38] 1 Cxc3 Rxc3 2 Rf5 b5', '41 Rf5?!', '41…Rd3??'], 39, 'S. Tarrasch', 'E. Lasker'],
    ['Partida 46', ['S. Tarrasch-I. Gunsberg', 'Francfort 1887', '5º Congreso de la Asociación Alemana',
      'k1br3r/ppq3pp/2p1pp1n/2P5/3P4/1R1B1N1P/P2Q1PP1/1R4K1 w - - 0 21', '<img alt="" src="d.jpg">',
      'Stockfish 13 eval: [+2.44] 21 Aa6 Td5 22 Axb7+ Axb7', '22 Tb6!', '22…e5!'], 46, 'S. Tarrasch', 'I. Gunsberg'],
  ])('finds the heading above the FEN of %s', (first, rest, number, white, black) => {
    const html = p(['1 e4 e5 2 Cf3 Cc6', '0-1', 'Una partida que se recordaría durante años en la historia del ajedrez mundial.', first, ...rest])
    const { text, games: g } = games(html)
    const s = describeGames(text, g).at(-1)!
    expect(s.header).toMatchObject({ number, white, black })
    expect(text.slice(s.headingStart, s.headingStart + 10)).toBe(first)
  })
})

describe('the layout switch of a game that starts from a diagram with a hidden FEN line (Lichess studies)', () => {
  const fen = '7k/8/8/8/8/8/8/R6K w - - 0 1'
  const prepared = `<h2>Rook vs King</h2>
<p><em>Study: Rook mates</em></p>
<img class="diagram" src="data:image/svg+xml;charset=utf-8,x" alt="Diagram" data-fen="${fen}" data-text-fen="${fen}">
<p class="epub-fen-hidden" aria-hidden="true">${fen}</p>
<p>In this position the power of the Rook is demonstrated,</p>
<p>1. Ra7</p>
<p>which confines the King.</p>
<p>1... Kg8 2. Kg2</p>
<p>Then.</p>
<p>2... Kf8 (2... Kh8 3. Ra8#)</p>
<p>3. Kf3 *</p>`
  const hiddenTexts = (html: string) => [...new DOMParser().parseFromString(html, 'text/html').querySelectorAll('.epub-fen-hidden')].map((p) => p.textContent)

  it('keeps the text visible in braces: only the FEN line stays hidden', () => {
    const braces = applyGameLayouts(prepared, games(prepared).games, { 0: 'braces' })
    expect(braces).not.toBe(prepared)
    expect(hiddenTexts(braces)).toEqual([fen])
    const doc = new DOMParser().parseFromString(braces, 'text/html')
    const visible = [...doc.querySelectorAll('p')].filter((p) => !p.classList.contains('epub-fen-hidden')).map((p) => p.textContent)
    expect(visible.join(' ')).toContain('1. Ra7 { which confines the King. } 1... Kg8 2. Kg2 { Then. } 2... Kf8 (2... Kh8 3. Ra8#)')
    expect(doc.querySelectorAll('img.diagram')).toHaveLength(1)
  })

  it('and back to paragraphs, the same: text visible, FEN hidden, one diagram', () => {
    const braces = applyGameLayouts(prepared, games(prepared).games, { 0: 'braces' })
    const back = applyGameLayouts(braces, games(braces).games, { 0: 'paragraphs' })
    expect(hiddenTexts(back)).toEqual([fen])
    const doc = new DOMParser().parseFromString(back, 'text/html')
    expect([...doc.querySelectorAll('p')].filter((p) => !p.classList.contains('epub-fen-hidden')).map((p) => p.textContent)).toContain('which confines the King.')
    expect(doc.querySelectorAll('img.diagram')).toHaveLength(1)
  })
})
