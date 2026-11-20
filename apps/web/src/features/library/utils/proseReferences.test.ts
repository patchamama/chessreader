import { describe, expect, it } from 'vitest'
import { findProseReferences } from '@chess-ebook/chess-shared'
import { referenceMark } from './proseReferences'
import { planMoveTargets } from './proseText'

const FEN = '1r1qkr2/pp3ppp/8/8/8/8/PPP3PP/4K3 w - - 0 21'

describe('referenceMark', () => {
  it('idea move: origin and destination lit, one arrow', () => {
    const [ref] = findProseReferences('21…Tb6, con idea de Df6', { lang: 'es' })
    const mark = referenceMark(ref, FEN)
    expect(mark.line.sort()).toEqual(['d8', 'f6'])
    expect(mark.arrows).toEqual([['d8', 'f6']])
  })
  it('files: the 16 squares of columns b and c', () => {
    const [ref] = findProseReferences('sobre las columnas b y c')
    expect(referenceMark(ref, FEN).line).toHaveLength(16)
  })
  it('advance chain: two arrows', () => {
    const [ref] = findProseReferences('con el avance h2-h4-h5')
    expect(referenceMark(ref, FEN).arrows).toEqual([['h2', 'h4'], ['h4', 'h5']])
  })
})

describe('planMoveTargets with references', () => {
  it('a reference paints its range and replaces the isolated move inside it', () => {
    const text = 'con idea de Df6'
    const refs = findProseReferences(text, { lang: 'es' })
    const iso = { square: 'f6', piece: 'q', rawSan: 'Df6', charStart: 12, charEnd: 15 } as never
    const targets = planMoveTargets(text, [], [iso], refs)
    expect(targets.map((t) => t.kind)).toEqual(['ref'])
  })
})
