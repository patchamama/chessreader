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
