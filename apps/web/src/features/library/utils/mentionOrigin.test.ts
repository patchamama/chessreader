import { describe, it, expect } from 'vitest'
import { mentionOrigins } from './mentionOrigin'

describe('mentionOrigins: which piece the text means by "Ab5"', () => {
  it('finds the bishop that reaches the square', () => {
    expect(mentionOrigins('4k3/8/8/8/2B5/8/8/4K3 w - - 0 1', 'b', 'b5')).toEqual(['c4'])
  })
  it('looks at the side that is not to move when the side to move has no such piece', () => {
    expect(mentionOrigins('4k3/8/8/8/2B5/8/8/4K3 b - - 0 1', 'b', 'b5')).toEqual(['c4'])
  })
  it('lists every piece of the side that reaches it (two knights)', () => {
    expect(mentionOrigins('4k3/8/8/8/8/N1N5/8/4K3 w - - 0 1', 'n', 'b5')).toEqual(['a3', 'c3'])
  })
  it('prefers the side to move over the other side', () => {
    expect(mentionOrigins('4k3/3b4/8/8/2B5/8/8/4K3 b - - 0 1', 'b', 'b5')).toEqual(['d7'])
    expect(mentionOrigins('4k3/3b4/8/8/2B5/8/8/4K3 w - - 0 1', 'b', 'b5')).toEqual(['c4'])
  })
  it('gives nothing for a pawn, an unreachable square or a bad position', () => {
    expect(mentionOrigins('4k3/8/8/8/2B5/8/8/4K3 w - - 0 1', 'p', 'b5')).toEqual([])
    expect(mentionOrigins('4k3/8/8/8/2B5/8/8/4K3 w - - 0 1', 'b', 'b6')).toEqual([])
    expect(mentionOrigins('not a fen', 'b', 'b5')).toEqual([])
  })
})
