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
})
