import { describe, expect, it } from 'vitest'
import { engineMark } from './engineQuality'
import type { DiagramEvaluation } from '../../library/diagramEval/diagramEvalStore'

const ev = (...lines: { pv: string[]; scoreCp?: number; mate?: number }[]): DiagramEvaluation => ({ engine: 'fake', depth: 10, lines, at: 0 })

describe('engineMark', () => {
  it('calls a move that costs 150 cp or more bad', () => {
    expect(engineMark(ev({ pv: ['e2e4'], scoreCp: 30 }), ev({ pv: ['e7e5'], scoreCp: 200 }), 'a2a3')).toBe('bad')
    expect(engineMark(ev({ pv: ['e2e4'], scoreCp: 30 }), ev({ pv: ['e7e5'], scoreCp: 100 }), 'a2a3')).toBeNull()
  })
  it('calls the engine first choice good when the next move is 100 cp worse', () => {
    const before = ev({ pv: ['d1h5'], scoreCp: 80 }, { pv: ['a2a3'], scoreCp: -40 })
    expect(engineMark(before, ev({ pv: ['e7e5'], scoreCp: -80 }), 'd1h5')).toBe('good')
    expect(engineMark(before, ev({ pv: ['e7e5'], scoreCp: -80 }), 'a2a3')).toBeNull()
    expect(engineMark(ev({ pv: ['d1h5'], scoreCp: 80 }, { pv: ['a2a3'], scoreCp: 20 }), ev({ pv: ['e7e5'], scoreCp: -80 }), 'd1h5')).toBeNull()
  })
  it('treats mate as a huge score and is neutral without lines', () => {
    expect(engineMark(ev({ pv: ['e2e4'], mate: 3 }), ev({ pv: ['e7e5'], scoreCp: 0 }), 'a2a3')).toBe('bad')
    expect(engineMark(ev(), ev(), 'a2a3')).toBeNull()
  })
})
