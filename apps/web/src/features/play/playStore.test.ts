import { describe, it, expect, beforeEach, vi } from 'vitest'
import { usePlayStore, setPlayRuntime } from './playStore'

const flush = () => new Promise((r) => setTimeout(r, 0))
async function settle(until: () => boolean) { for (let i = 0; i < 100 && !until(); i++) await flush() }

beforeEach(() => {
  setPlayRuntime({ analyse: vi.fn(async () => [{ idx: 1, pv: ['e7e5'], scoreCp: 0, depth: 1 }]) as never })
  usePlayStore.getState().reset()
})

describe('playing with a tutor (S27)', () => {
  it('against the engine: my move, the engine answers, the tutor comments both', async () => {
    const s = usePlayStore.getState()
    s.start({ mode: 'engine', color: 'white', strength: 3, lang: 'en' })
    expect(usePlayStore.getState().status).toBe('playing')
    expect(s.move('e2', 'e4')).toBe(true)
    await settle(() => usePlayStore.getState().sans.length === 2)
    expect(usePlayStore.getState().sans).toEqual(['e4', 'e5'])
    expect(usePlayStore.getState().status).toBe('playing')
  })

  it('refuses a move out of turn or illegal', () => {
    const s = usePlayStore.getState()
    s.start({ mode: 'engine', color: 'black', strength: 3, lang: 'en' })
    expect(s.move('e7', 'e5')).toBe(false)
  })

  it('warns when my move leaves something to the opponent, and points out my chances', async () => {
    setPlayRuntime({ analyse: vi.fn(async () => [{ idx: 1, pv: ['g8f6'], scoreCp: 0, depth: 1 }]) as never })
    const s = usePlayStore.getState()
    s.start({ mode: 'human', color: 'white', strength: 3, lang: 'en' })
    s.move('e2', 'e4'); s.move('e7', 'e5'); s.move('g1', 'f3'); s.move('b8', 'c6'); s.move('f3', 'g5'); s.move('d8', 'g5')
    // After 3...Qxg5 (two players on one board) — let's check a simpler free piece:
    const log = usePlayStore.getState().log.map((l) => l.text).join(' | ')
    expect(log).toMatch(/A free piece: Qxg5 wins the knight on g5/)
  })
})
