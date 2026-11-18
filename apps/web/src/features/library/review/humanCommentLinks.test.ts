import { describe, it, expect, vi } from 'vitest'
import { withCommentAlternatives } from './humanCommentLinks'
import { parseCommentMark } from '../utils/diagramMark'

vi.mock('../../../shared/api/serverSession', () => ({ hasServerSession: () => false }))

describe('withCommentAlternatives (S4)', () => {
  it('writes the other remarks of the position onto its comment mark', () => {
    const fen = '8/8/8/8/8/8/8/K6k w - - 0 1'
    const text = `1. e4\n[Comment source="A" text="One." fen="${fen}"]\n1... e5`
    const out = withCommentAlternatives(text, {
      1: { text: 'One.', source: 'A', alternatives: [{ text: 'One.', source: 'A' }, { text: 'Two.', source: 'B' }] },
    }, [{ fenAfter: fen }])
    const line = out.split('\n')[1]
    expect(parseCommentMark(line)!.alternatives).toEqual([{ text: 'One.', source: 'A' }, { text: 'Two.', source: 'B' }])
    expect(out.split('\n')[0]).toBe('1. e4')
  })

  it('leaves the text as it is when no position has more than one remark', () => {
    const text = '1. e4\n[Comment source="A" text="One." fen="x"]'
    expect(withCommentAlternatives(text, { 1: { text: 'One.', source: 'A' } }, [{ fenAfter: 'x' }])).toBe(text)
  })
})
