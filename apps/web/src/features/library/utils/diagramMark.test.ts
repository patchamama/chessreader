import { describe, it, expect } from 'vitest'
import { commentAlternativesAttr, parseCommentMark } from './diagramMark'

describe('parseCommentMark alternatives (S4)', () => {
  it('reads the other remarks the database holds on the same position', () => {
    const alts = [
      { text: 'First idea.', source: 'Book A', gameId: 'g1', ply: 12 },
      { text: 'Second idea.', source: 'Book B' },
    ]
    const line = `[Comment source="Book A" text="First idea." fen="8/8/8/8/8/8/8/K6k w - - 0 1" game="g1" ply="12"${commentAlternativesAttr(alts)}]`
    const mark = parseCommentMark(line)!
    expect(mark.text).toBe('First idea.')
    expect(mark.alternatives).toEqual(alts)
  })

  it('a mark with one remark has no alternatives, and the attribute is empty for fewer than two', () => {
    expect(parseCommentMark('[Comment source="S" text="Only."]')!.alternatives).toBeUndefined()
    expect(commentAlternativesAttr([{ text: 'Only.', source: 'S' }])).toBe('')
  })

  it('ignores a malformed alternatives attribute', () => {
    expect(parseCommentMark('[Comment source="S" text="T" alts="%7Bbroken"]')!.alternatives).toBeUndefined()
  })
})
