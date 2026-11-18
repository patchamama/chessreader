import { describe, expect, it } from 'vitest'
import { recognizeGames } from '@chess-ebook/chess-shared'
import { bracesToParagraphs, paragraphsToBraces } from './commentLayout'

const sans = (t: string) => { const [g] = recognizeGames(t, { algorithm: 2 }); return g.tree.mainline.map((id) => g.tree.nodes.get(id)!.san) }

describe('comments in braces ⇄ comments as paragraphs (S19)', () => {
  const braces = '1. e4 e5 2. Nf3 { The knight attacks e5. } Nc6 3. Bb5 { The Spanish game. } a6 4. Ba4'

  it('braces become paragraphs after their move, with the move number to go on', () => {
    expect(bracesToParagraphs(braces)).toBe('1. e4 e5 2. Nf3\nThe knight attacks e5.\n2... Nc6 3. Bb5\nThe Spanish game.\n3... a6 4. Ba4')
    expect(sans(bracesToParagraphs(braces))).toEqual(sans(braces))
  })

  it('paragraphs between the moves go back into braces', () => {
    expect(paragraphsToBraces(bracesToParagraphs(braces))).toBe('1. e4 e5 2. Nf3 { The knight attacks e5. } 2... Nc6 3. Bb5 { The Spanish game. } 3... a6 4. Ba4')
    expect(sans(paragraphsToBraces(bracesToParagraphs(braces)))).toEqual(sans(braces))
  })

  it('with the lines of moves told, a book without dots and comments opening with a move go into braces (S10)', () => {
    const text = '1 d4 d5 2 c4 dxc4\nHablando en general, un gambito.\n3 Nf3 Nf6\n13 h4!? (Petrosian-Ignatiev, Moscú 1958).\n\uFFFC\n4 e3'
    const moveLines = new Set([0, 2, 5])
    expect(paragraphsToBraces(text, (i) => moveLines.has(i))).toBe(
      '1 d4 d5 2 c4 dxc4 { Hablando en general, un gambito. } 3 Nf3 Nf6 { 13 h4!? (Petrosian-Ignatiev, Moscú 1958). }\n\uFFFC\n4 e3',
    )
  })
})
