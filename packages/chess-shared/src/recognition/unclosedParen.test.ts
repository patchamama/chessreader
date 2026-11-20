import { describe, it, expect } from 'vitest'
import { recognizeGames } from './recognizeGames.js'

const sans = (text: string) => {
  const g = recognizeGames(text, { algorithm: 2 })[0]
  return g.tree.mainline.map((id) => g.tree.nodes.get(id)!.san)
}

// Partida 37 (Lasker–Steinitz): a comment paragraph opens "(" and never closes it.
describe('a "(" left open at the end of its paragraph', () => {
  const text = [
    '1 e4 e5 2 Nf3 Nc6',
    'A comment (the main idea 3 Bc4 Bc5 4 c3 Nf6 and more text, with a note (Euwe) and then the paragraph ends.',
    '3 Bb5 a6 4 Ba4 Nf6',
    'Another comment, 4...Nf6 5 O-O Be7) with a stray closer far away.',
  ].join('\n\n')

  it('does not swallow the main line that goes on in the next paragraph', () => {
    expect(sans(text)).toEqual(['e4', 'e5', 'Nf3', 'Nc6', 'Bb5', 'a6', 'Ba4', 'Nf6'])
  })

  it('still lets a variation run across paragraphs when the next paragraph does not start with a move', () => {
    const multi = ['1 e4 e5 2 Nf3 Nc6', 'A comment (3 Bc4 Bc5', 'and the variation goes on here) end.', '3 Bb5 a6'].join('\n\n')
    expect(sans(multi)).toEqual(['e4', 'e5', 'Nf3', 'Nc6', 'Bb5', 'a6'])
  })
})
