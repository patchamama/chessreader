import { afterEach, describe, expect, it, vi } from 'vitest'
import { judgeByEngine, judgeByTablebase, lichessTablebase, MOVE_KIND_COLORS } from './moveJudge'

describe('judgeByEngine', () => {
  it('rates a move by the winning chances it gives away against the best move', () => {
    // White to move; scores from White's point of view
    expect(judgeByEngine({ cp: 30 }, { cp: 30 }, 'w', true)).toEqual({ kind: 'best', loss: 0 })
    expect(judgeByEngine({ cp: 30 }, { cp: 0 }, 'w', false).kind).toBe('good')
    expect(judgeByEngine({ cp: 30 }, { cp: -120 }, 'w', false).kind).toBe('inaccuracy')
    expect(judgeByEngine({ cp: 30 }, { cp: -250 }, 'w', false).kind).toBe('mistake')
    expect(judgeByEngine({ cp: 30 }, { mate: -2 }, 'w', false).kind).toBe('blunder')
  })
  it('reads the scores for Black when Black moved', () => {
    expect(judgeByEngine({ cp: -30 }, { mate: 3 }, 'b', false).kind).toBe('blunder')
    expect(judgeByEngine({ cp: -30 }, { cp: -30 }, 'b', false).kind).toBe('best')
  })
  it('every kind has a colour for the board and the legend', () => {
    expect(Object.keys(MOVE_KIND_COLORS)).toEqual(['book', 'best', 'good', 'inaccuracy', 'mistake', 'blunder'])
  })
})

const TB = {
  category: 'win',
  moves: [
    { uci: 'b1e4', san: 'Qe4', category: 'loss' },
    { uci: 'b1b3', san: 'Qb3+', category: 'loss' },
    { uci: 'b1c2', san: 'Qc2+', category: 'draw' },
    { uci: 'b1b4', san: 'Qb4', category: 'win' },
  ],
}

describe('judgeByTablebase', () => {
  it('a move that keeps the result of the best move is best; losing a win is a blunder', () => {
    expect(judgeByTablebase(TB, 'b1b3')).toEqual({ kind: 'best', loss: 0, tablebase: 'win' })
    expect(judgeByTablebase(TB, 'b1c2')).toEqual({ kind: 'blunder', loss: 50, tablebase: 'draw' })
    expect(judgeByTablebase(TB, 'b1b4')).toEqual({ kind: 'blunder', loss: 100, tablebase: 'loss' })
  })
  it('a move the tablebase does not list is not judged', () => {
    expect(judgeByTablebase(TB, 'a1a2')).toBeNull()
  })
})

describe('lichessTablebase', () => {
  afterEach(() => vi.unstubAllGlobals())
  it('asks the Lichess tablebase only with 7 pieces or fewer', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify(TB), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)
    await expect(lichessTablebase('8/8/8/8/8/2k5/8/KQ6 w - - 0 1')).resolves.toEqual(TB)
    expect(fetchMock).toHaveBeenCalledWith('https://tablebase.lichess.ovh/standard?fen=8%2F8%2F8%2F8%2F8%2F2k5%2F8%2FKQ6%20w%20-%20-%200%201')
    await expect(lichessTablebase('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1')).resolves.toBeNull()
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})
