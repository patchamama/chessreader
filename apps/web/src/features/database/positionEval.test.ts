import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createEvaluator, evaluateAll, formatEval } from './positionEval'

const WHITE_TO_MOVE = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'
const BLACK_TO_MOVE = 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1'
const line = (scoreCp?: number, mate?: number, depth = 12) => [{ idx: 1, pv: ['e2e4'], scoreCp, mate, depth }]

beforeEach(() => { try { localStorage.clear() } catch { /* none */ } })

describe('formatEval (S23)', () => {
  it('writes the score from White', () => {
    expect(formatEval({ cp: 35 })).toBe('+0.35')
    expect(formatEval({ cp: -120 })).toBe('-1.20')
    expect(formatEval({ cp: 0 })).toBe('0.00')
    expect(formatEval({ mate: 5 })).toBe('M5')
    expect(formatEval({ mate: -3 })).toBe('-M3')
  })
})

describe('createEvaluator (S23)', () => {
  it('turns the score of the side to move into White\'s point of view', async () => {
    const analyse = vi.fn().mockResolvedValue(line(50))
    const ev = createEvaluator(analyse)
    expect((await ev.evaluate(WHITE_TO_MOVE))?.cp).toBe(50)
    expect((await ev.evaluate(BLACK_TO_MOVE))?.cp).toBe(-50)
    localStorage.clear()
    analyse.mockResolvedValue(line(undefined, 4))
    expect((await createEvaluator(analyse).evaluate(BLACK_TO_MOVE))?.mate).toBe(-4)
  })
  it('asks the engine once per position: memory, then localStorage', async () => {
    const analyse = vi.fn().mockResolvedValue(line(10, undefined, 13))
    const ev = createEvaluator(analyse)
    await ev.evaluate(WHITE_TO_MOVE)
    await ev.evaluate(WHITE_TO_MOVE)
    expect(analyse).toHaveBeenCalledTimes(1)
    const again = createEvaluator(analyse)
    expect(again.cached(WHITE_TO_MOVE)).toMatchObject({ cp: 10, depth: 13 })
    await again.evaluate(WHITE_TO_MOVE)
    expect(analyse).toHaveBeenCalledTimes(1)
  })
  it('gives null when the engine fails or has no answer, and does not cache it', async () => {
    const analyse = vi.fn().mockRejectedValueOnce(new Error('no worker')).mockResolvedValueOnce([]).mockResolvedValue(line(5))
    const ev = createEvaluator(analyse)
    expect(await ev.evaluate(WHITE_TO_MOVE)).toBeNull()
    expect(await ev.evaluate(WHITE_TO_MOVE)).toBeNull()
    expect((await ev.evaluate(WHITE_TO_MOVE))?.cp).toBe(5)
  })
})

describe('evaluateAll (S23)', () => {
  it('evaluates one position at a time, in order, with progress', async () => {
    let live = 0
    let peak = 0
    const analyse = vi.fn(async () => { live++; peak = Math.max(peak, live); await new Promise((r) => setTimeout(r, 1)); live--; return line(1) })
    const seen: Array<[string, number]> = []
    await evaluateAll([WHITE_TO_MOVE, BLACK_TO_MOVE], createEvaluator(analyse), { onResult: (fen, _e, done) => seen.push([fen, done]) })
    expect(peak).toBe(1)
    expect(seen).toEqual([[WHITE_TO_MOVE, 1], [BLACK_TO_MOVE, 2]])
  })
  it('stops when cancelled', async () => {
    const ctl = new AbortController()
    const analyse = vi.fn(async () => { ctl.abort(); return line(1) })
    const seen: string[] = []
    await evaluateAll([WHITE_TO_MOVE, BLACK_TO_MOVE], createEvaluator(analyse), { signal: ctl.signal, onResult: (f) => seen.push(f) })
    expect(analyse).toHaveBeenCalledTimes(1)
    expect(seen).toEqual([])
  })
})
