import { describe, expect, it } from 'vitest'
import { answerLevel, levelMargin, startLevel } from './levelEstimate'

describe('level test (S14)', () => {
  it('solving a puzzle above the estimate raises it, failing one below lowers it', () => {
    const up = answerLevel(startLevel(1500), 1700, true)
    expect(up.rating).toBeGreaterThan(1650)
    const down = answerLevel(startLevel(1500), 1300, false)
    expect(down.rating).toBeLessThan(1350)
  })
  it('the steps get smaller, and the margin narrows with more puzzles', () => {
    let s = startLevel(1500)
    for (let i = 0; i < 14; i++) s = answerLevel(s, 1500, i % 2 === 0)
    const before = s.rating
    s = answerLevel(s, 1500, true)
    expect(Math.abs(s.rating - before)).toBeLessThanOrEqual(40)
    expect(levelMargin(s)).toBe(90)
  })
})
