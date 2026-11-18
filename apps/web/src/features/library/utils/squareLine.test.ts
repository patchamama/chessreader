import { describe, expect, it } from 'vitest'
import { dashedPair, squareLine } from './squareLine'

describe('squares named as a line in the text (a2-g8)', () => {
  it('a diagonal, a file or a rank gives every square on it', () => {
    expect(squareLine('a2', 'g8')).toEqual(['a2', 'b3', 'c4', 'd5', 'e6', 'f7', 'g8'])
    expect(squareLine('e1', 'e4')).toEqual(['e1', 'e2', 'e3', 'e4'])
    expect(squareLine('h1', 'a1')).toEqual(['h1', 'g1', 'f1', 'e1', 'd1', 'c1', 'b1', 'a1'])
  })
  it('squares not on a line give nothing', () => {
    expect(squareLine('g1', 'f3')).toBeNull()
  })
  it('reads "a2-g8" and "Ac8-b7" from the text', () => {
    expect(dashedPair('a2-g8')).toEqual({ from: 'a2', to: 'g8' })
    expect(dashedPair('Bc8-b7')).toEqual({ from: 'c8', to: 'b7' })
    expect(dashedPair('Nf3')).toBeNull()
  })
})
