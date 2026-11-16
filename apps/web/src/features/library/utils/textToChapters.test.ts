import { describe, it, expect } from 'vitest'
import { textToChapters } from './textToChapters'

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
