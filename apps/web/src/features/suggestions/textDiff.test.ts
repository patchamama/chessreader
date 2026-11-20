import { describe, expect, it } from 'vitest'
import { textDiff } from './textDiff'

describe('textDiff', () => {
  it('marks removed and added words and keeps the rest', () => {
    expect(textDiff('the quick brown fox', 'the slow brown fox jumps')).toEqual([
      { type: 'same', text: 'the ' },
      { type: 'removed', text: 'quick' },
      { type: 'added', text: 'slow' },
      { type: 'same', text: ' brown fox' },
      { type: 'added', text: ' jumps' },
    ])
  })

  it('equal texts are one unchanged part; an empty side is all added or removed', () => {
    expect(textDiff('same text', 'same text')).toEqual([{ type: 'same', text: 'same text' }])
    expect(textDiff('', 'new')).toEqual([{ type: 'added', text: 'new' }])
    expect(textDiff('old', '')).toEqual([{ type: 'removed', text: 'old' }])
  })
})
