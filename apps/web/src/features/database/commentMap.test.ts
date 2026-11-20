import { describe, expect, it } from 'vitest'
import { Chess } from 'chess.js'
import { accumulatedView, analyseMoves, legalMoves, perMoveView, type MapResult } from './commentMap'

const START = new Chess().fen()
const AFTER_E4 = 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1'

describe('legalMoves', () => {
  it('lists every legal move grouped by piece, queen promotion only', () => {
    const moves = legalMoves(START)
    expect(moves).toHaveLength(20)
    const froms = moves.map((m) => m.from)
    expect(froms.filter((f, i) => i > 0 && f !== froms[i - 1])).toHaveLength(new Set(froms).size - 1)
    const promo = legalMoves('8/P6k/8/8/8/8/8/K7 w - - 0 1').filter((m) => m.from === 'a7')
    expect(promo).toHaveLength(1)
    expect(promo[0].san).toBe('a8=Q')
  })
})

describe('analyseMoves (S20)', () => {
  it('counts every move with the count function and reports progress', async () => {
    const seen: Array<[number, number]> = []
    const results: MapResult[] = []
    const count = async (fen: string) => (fen === AFTER_E4 ? 7 : 1)
    await analyseMoves(START, count, { onResult: (r, done, total) => { results.push(r); seen.push([done, total]) } })
    expect(results).toHaveLength(20)
    expect(results.find((r) => r.san === 'e4')).toMatchObject({ piece: 'P', from: 'e2', to: 'e4', count: 7 })
    expect(seen.at(-1)).toEqual([20, 20])
  })
  it('limits the concurrency', async () => {
    let live = 0
    let peak = 0
    const count = async () => { live++; peak = Math.max(peak, live); await new Promise((r) => setTimeout(r, 1)); live--; return 0 }
    await analyseMoves(START, count, { onResult: () => {}, concurrency: 4 })
    expect(peak).toBeLessThanOrEqual(4)
    expect(peak).toBeGreaterThan(1)
  })
  it('stops when cancelled', async () => {
    const ctl = new AbortController()
    let n = 0
    const count = async () => { n++; if (n === 3) ctl.abort(); return 1 }
    const results: MapResult[] = []
    await analyseMoves(START, count, { onResult: (r) => results.push(r), signal: ctl.signal, concurrency: 1 })
    expect(results.length).toBeLessThan(20)
  })
})

describe('views (S20)', () => {
  const r = (piece: string, from: string, to: string, count: number): MapResult => ({ piece, from, to, san: `${piece}${to}`, count })
  const results = [r('N', 'b1', 'c3', 4), r('P', 'c2', 'c3', 6), r('B', 'd2', 'c3', 1), r('N', 'g1', 'f3', 2)]
  it('per move: the best single move to each square, with the pieces', () => {
    const v = perMoveView(results)
    expect(v.get('c3')).toEqual({ count: 6, pieces: ['P'] })
    expect(v.get('f3')).toEqual({ count: 2, pieces: ['N'] })
  })
  it('accumulated: the sum, and the pieces analysed so far that reach the square', () => {
    const v = accumulatedView(results)
    expect(v.get('c3')).toEqual({ count: 11, pieces: ['N', 'P', 'B'] })
    expect(v.get('f3')).toEqual({ count: 2, pieces: ['N'] })
  })
})
