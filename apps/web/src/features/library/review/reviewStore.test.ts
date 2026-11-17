import { afterEach, describe, expect, it, vi } from 'vitest'
import { reviewEngine } from './reviewStore'
import { useSettingsStore } from '../../../shared/settings/settingsStore'

const FEN = 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1'

describe('reviewEngine', () => {
  afterEach(() => { vi.unstubAllGlobals(); useSettingsStore.getState().reset() })

  it('with the Lichess cloud as source, reviews with the cloud lines (S1)', async () => {
    useSettingsStore.getState().set({ engineSource: 'lichess-cloud' })
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ depth: 45, knodes: 1, pvs: [{ moves: 'e7e5', cp: 20 }, { moves: 'c7c5', cp: 30 }] }), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)
    const lines = await reviewEngine()(FEN, 12, 2)
    expect(lines.map((l) => [l.pv[0], l.scoreCp, l.depth])).toEqual([['e7e5', -20, 45], ['c7c5', -30, 45]])
    expect(String((fetchMock.mock.calls[0] as unknown[])[0])).toContain('multiPv=2')
  })
})
