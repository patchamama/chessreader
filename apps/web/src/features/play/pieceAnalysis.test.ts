import { describe, expect, it, vi } from 'vitest'
import { analyseMoves, clearPieceAnalysis, describePiece, hintsFromMoves, localSan, precomputeHints } from './pieceAnalysis'

const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'

/** A fake engine: the position after each move gets a score (side to move = the opponent) and a reply. */
function fakeEngine(scores: Record<string, number>) {
  return vi.fn(async (fen: string, _d: number, count: number) => {
    if (fen === START) return [{ idx: 1, pv: ['e2e4'], scoreCp: 30, depth: 6 }, { idx: 2, pv: ['g1f3'], scoreCp: 25, depth: 6 }].slice(0, count)
    const key = Object.keys(scores).find((k) => fen.startsWith(k))
    return [{ idx: 1, pv: ['e7e5'], scoreCp: key ? -scores[key] : 0, depth: 6 }]
  })
}

describe('analysing the moves of a piece (S14.4, S14.8)', () => {
  it('scores every move of the piece from the mover side with the opponent best reply, cached by position', async () => {
    clearPieceAnalysis()
    const analyse = fakeEngine({ 'rnbqkbnr/pppppppp/8/8/8/5N2': 20, 'rnbqkbnr/pppppppp/8/8/8/7N': -40 })
    const moves = await analyseMoves(analyse, START, 'g1')
    expect(moves.map((m) => [m.san, m.cp, m.reply])).toEqual([['Nf3', 20, 'e5'], ['Nh3', -40, 'e5']])
    await analyseMoves(analyse, START, 'g1')
    expect(analyse).toHaveBeenCalledTimes(2)
  })
  it('colours each destination by how much it loses against the best move of the piece', async () => {
    clearPieceAnalysis()
    const moves = await analyseMoves(fakeEngine({ 'rnbqkbnr/pppppppp/8/8/8/5N2': 20, 'rnbqkbnr/pppppppp/8/8/8/7N': -300 }), START, 'g1')
    expect(hintsFromMoves(moves, 20)).toEqual({ f3: 'good', h3: 'bad' })
  })
  it('writes what moving the piece implies, in the selected language', async () => {
    clearPieceAnalysis()
    const moves = await analyseMoves(fakeEngine({ 'rnbqkbnr/pppppppp/8/8/8/5N2': 20, 'rnbqkbnr/pppppppp/8/8/8/7N': -40 }), START, 'g1')
    expect(describePiece(moves, START, 'g1', 'es')).toBe('Caballo de g1: Cf3 (+0.20, responde e5), Ch3 (−0.40, responde e5).')
    expect(describePiece(moves, START, 'g1', 'en')).toBe('Knight on g1: Nf3 (+0.20, reply e5), Nh3 (−0.40, reply e5).')
  })
  it('localSan uses the letters of the language', () => {
    expect(localSan('Qxe7+', 'es')).toBe('Dxe7+')
    expect(localSan('e8=Q', 'de')).toBe('e8=D')
    expect(localSan('Nf3', 'en')).toBe('Nf3')
  })
  it('precomputes piece by piece, starting with the pieces of the engine top moves', async () => {
    clearPieceAnalysis()
    const analyse = fakeEngine({})
    const order: string[] = []
    await precomputeHints(analyse, START, (square) => { order.push(square) }, () => true, 2)
    expect(order.slice(0, 2)).toEqual(['e2', 'g1'])
    expect(order).toHaveLength(10) // eight pawns and two knights can move
    expect(analyse.mock.calls[0]).toEqual([START, expect.any(Number), 2])
  })
  it('stops precomputing when the position is no longer current', async () => {
    clearPieceAnalysis()
    const order: string[] = []
    await precomputeHints(fakeEngine({}), START, (s) => { order.push(s) }, () => order.length < 1, 2)
    expect(order).toEqual(['e2'])
  })
})

describe('notation setting (S14)', () => {
  it('localSan follows the figurine setting', async () => {
    const { useSettingsStore } = await import('../../shared/settings/settingsStore')
    useSettingsStore.setState({ notationStyle: 'figurine' })
    expect(localSan('Nf3', 'es')).toBe('♞f3')
    useSettingsStore.setState({ notationStyle: 'letters' })
  })
})
