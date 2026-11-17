import { afterEach, describe, expect, it, vi } from 'vitest'
import { lichessCloudEval, withCloudEval } from './cloudEval'

const AFTER_E4 = 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1'
const CLOUD = {
  fen: AFTER_E4, knodes: 119133, depth: 60,
  pvs: [
    { moves: 'e7e5 g1f3 b8c6 f1b5 g8f6 e1h1 f6e4', cp: 22 },
    { moves: 'c7c5 g1f3', cp: 32 },
  ],
}

describe('lichessCloudEval', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('asks the Lichess cloud for the lines of a position, scores for the side to move, castling as king to g1', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify(CLOUD), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)
    const lines = await lichessCloudEval(AFTER_E4, 2)
    expect(fetchMock.mock.calls[0][0]).toBe(`https://lichess.org/api/cloud-eval?fen=${encodeURIComponent(AFTER_E4)}&multiPv=2`)
    // cloud scores are from White's point of view; Black is to move here
    expect(lines).toEqual([
      { idx: 1, pv: ['e7e5', 'g1f3', 'b8c6', 'f1b5', 'g8f6', 'e1g1', 'f6e4'], scoreCp: -22, depth: 60, nodes: 119133000 },
      { idx: 2, pv: ['c7c5', 'g1f3'], scoreCp: -32, depth: 60, nodes: 119133000 },
    ])
  })

  it('a position the cloud does not know answers null (404)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{"error":"Not found"}', { status: 404 })))
    await expect(lichessCloudEval(AFTER_E4, 1)).resolves.toBeNull()
  })

  it('reads mate scores', async () => {
    const fen = '6k1/5ppp/8/8/8/8/5PPP/R5K1 w - - 0 1'
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ fen, knodes: 1, depth: 30, pvs: [{ moves: 'a1a8', mate: 1 }] }), { status: 200 })))
    await expect(lichessCloudEval(fen, 1)).resolves.toEqual([{ idx: 1, pv: ['a1a8'], mate: 1, depth: 30, nodes: 1000 }])
  })
})

describe('withCloudEval', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('uses the cloud when it knows the position, and the local engine is not asked', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify(CLOUD), { status: 200 })))
    const local = vi.fn()
    const lines = await withCloudEval(local)(AFTER_E4, 12, 2)
    expect(lines[0].pv[0]).toBe('e7e5')
    expect(local).not.toHaveBeenCalled()
  })

  it('falls back to the local engine when the cloud has no answer or cannot be reached', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')))
    const local = vi.fn().mockResolvedValue([{ idx: 1, pv: ['e7e5'], scoreCp: -20, depth: 12 }])
    await expect(withCloudEval(local)('8/8/8/8/8/8/8/K6k w - - 0 1', 12, 1)).resolves.toEqual([{ idx: 1, pv: ['e7e5'], scoreCp: -20, depth: 12 }])
    expect(local).toHaveBeenCalledWith('8/8/8/8/8/8/8/K6k w - - 0 1', 12, 1)
  })
})
