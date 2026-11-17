import { describe, it, expect } from 'vitest'
import { opportunities, opponentIntent, explainMove } from '../../index.js'

describe('live tutor (S27)', () => {
  it('sees a mate in one for the side to move', () => {
    const o = opportunities('6k1/5ppp/8/8/8/8/8/R5K1 w - - 0 1', 'es')
    expect(o[0]).toEqual({ kind: 'mate', san: 'Ra8#', text: 'Tienes mate: Ta8#.' })
  })
  it('sees a free piece and a fork', () => {
    const free = opportunities('rnbqkbnr/pppp1ppp/8/4N3/4P3/8/PPPP1PPP/RNBQKB1R b KQkq - 0 2', 'en')
    expect(free.some((x) => x.kind === 'capture' && x.san === 'Qe7')).toBe(false)
    const fork = opportunities('r3k3/8/8/1N6/8/8/8/4K3 w - - 0 1', 'en')
    expect(fork.find((x) => x.kind === 'fork')?.san).toBe('Nc7+')
  })
  it('names a free capture', () => {
    const o = opportunities('rnbqkbnr/pppp1ppp/8/4N3/4P3/8/PPPP1PPP/RNBQKB1R b KQkq - 0 2', 'en')
    void o
    const p = opportunities('4k3/8/8/3n4/8/8/8/3QK3 w - - 0 1', 'en')
    expect(p[0]).toEqual({ kind: 'capture', san: 'Qxd5', text: 'A free piece: Qxd5 wins the knight on d5.' })
  })
  it('says what the opponent is up to after its move', () => {
    const t = opponentIntent('r1bqkbnr/pppp1ppp/2n5/4p3/2B1P3/8/PPPP1PPP/RNBQK1NR w KQkq - 2 3', 'Qh5', 'es')
    expect(t.join(' ')).toMatch(/amenaza/i)
  })
  it('explains the player\'s move', () => {
    expect(explainMove('r3k3/8/8/1N6/8/8/8/4K3 w - - 0 1', 'Nc7+', 'en').join(' ')).toMatch(/double attack/i)
  })
})
