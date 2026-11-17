import { describe, it, expect } from 'vitest'
import { pickEngineMove, strengthSettings } from './enginePlayer'

const lines = [
  { pv: ['e2e4'], scoreCp: 40 },
  { pv: ['d2d4'], scoreCp: 30 },
  { pv: ['g1f3'], scoreCp: 20 },
  { pv: ['a2a3'], scoreCp: -60 },
] as never

describe('engine opponent strength', () => {
  it('full strength always plays the best line', () => {
    for (const r of [0, 0.5, 0.99]) expect(pickEngineMove(lines, 8, () => r)).toBe('e2e4')
  })
  it('a weak level searches shallow and picks among several lines, sometimes a worse one', () => {
    expect(strengthSettings(1)).toEqual({ depth: 1, lines: 4 })
    expect(strengthSettings(8)).toEqual({ depth: 16, lines: 1 })
    const picks = new Set([0, 0.3, 0.6, 0.95].map((r) => pickEngineMove(lines, 1, () => r)))
    expect(picks.size).toBeGreaterThan(1)
  })
  it('never picks a line that throws away more than the level allows', () => {
    // level 6 allows 50 cp: a2a3 (-60, 100 below the best) is never chosen
    for (const r of [0, 0.5, 0.99]) expect(pickEngineMove(lines, 6, () => r)).not.toBe('a2a3')
  })
})
