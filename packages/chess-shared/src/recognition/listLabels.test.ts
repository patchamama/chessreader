import { describe, it, expect } from 'vitest'
import { recognizeGames, DIAGRAM_MARK } from './recognizeGames.js'

const sans = (text: string) => {
  const games = recognizeGames(text, { algorithm: 2 })
  return games.map((g) => g.tree.mainline.map((id) => g.tree.nodes.get(id)!.san))
}

// The ")" of a list label ("1)", "a)") closes nothing. It must not turn a "("
// the book left open paragraphs ago into a "closed" comment, or the game cannot
// resume at the paragraph that continues it.
describe('list labels after a "(" left open', () => {
  const text = [
    '1 e4 e5 2 Nf3 Nc6',
    'A comment (the main idea 3 Bc4 Bc5 4 c3 and more text, never closed.',
    '3 Bb5 a6 4 Ba4 Nf6',
    DIAGRAM_MARK,
    'Now the options:',
    '1) 4…Bc5 5 c3 (5 O-O b5) 5…d6',
    'a) 5…Nf6 6 d4',
    '2) 4…d6 5 c3 Nf6',
    '5 O-O Be7 6 Re1 b5',
  ].join('\n\n')

  it('resumes the main line at the paragraph that continues it', () => {
    expect(sans(text)).toEqual([[
      'e4', 'e5', 'Nf3', 'Nc6', 'Bb5', 'a6', 'Ba4', 'Nf6', 'O-O', 'Be7', 'Re1', 'b5',
    ]])
  })

  it('keeps a game whose list has no stale bracket unchanged', () => {
    const plain = text.replace('(the main idea 3 Bc4 Bc5 4 c3 and more text, never closed.', 'the main idea 3 Bc4 Bc5 4 c3 and more text.')
    expect(sans(plain)).toEqual(sans(text))
  })
})
