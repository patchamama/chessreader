import { describe, it, expect } from 'vitest'
import { recognizeGames } from '@chess-ebook/chess-shared'
import { analyseGame, hintsForSquare, type AnalysePosition } from './reviewEngine'

const [game] = recognizeGames('1. e4 e5 2. Qh5 Nc6 3. Bc4 Nf6 4. Qxf7#', { algorithm: 2 })

describe('analyseGame', () => {
  it('evaluates every position once, from White\'s point of view, with the engine line in SAN', async () => {
    const asked: string[] = []
    // The engine speaks for the side to move: +50 for whoever is to move.
    const analyse: AnalysePosition = async (fen) => {
      asked.push(fen)
      const white = fen.split(' ')[1] === 'w'
      return [{ idx: 1, depth: 10, scoreCp: 50, pv: white ? ['g1f3'] : ['g8f6'] }]
    }
    const progress: number[] = []
    const plies = await analyseGame(game.tree, analyse, { depth: 10, onProgress: (done) => progress.push(done) })
    expect(plies.map((p) => p.san)).toEqual(['e4', 'e5', 'Qh5', 'Nc6', 'Bc4', 'Nf6', 'Qxf7#'])
    expect(asked).toHaveLength(7) // the mated position is not sent to the engine
    expect(plies[0].before).toEqual({ cp: 50 })
    expect(plies[0].after).toEqual({ cp: -50 }) // Black to move: +50 for Black
    expect(plies[0].best).toEqual({ san: 'Nf3', line: ['Nf3'] })
    expect(plies[6].after).toEqual({ mate: 1 }) // White has mated
    expect(progress[progress.length - 1]).toBe(8)
  })

  it('never rates a position below what the move actually played achieves', async () => {
    // A shallow search misses the win before the last move; the next position proves it.
    const analyse: AnalysePosition = async () => [{ idx: 1, depth: 4, scoreCp: 0, pv: [] }]
    const plies = await analyseGame(game.tree, analyse, { depth: 4 })
    expect(plies[6].before).toEqual({ mate: 1 }) // 4. Qxf7# was there to be played
    expect(plies[5].after).toEqual({ mate: 1 })
    expect(plies[5].before).toEqual({ cp: 0 }) // Black still had other moves
  })

  it('asks for two lines and keeps the second choice with its evaluation (S31)', async () => {
    const counts: number[] = []
    const analyse: AnalysePosition = async (fen, _d, count) => {
      counts.push(count)
      const white = fen.split(' ')[1] === 'w'
      return [
        { idx: 1, depth: 10, scoreCp: 50, pv: white ? ['g1f3'] : ['g8f6'] },
        { idx: 2, depth: 10, scoreCp: -120, pv: white ? ['a2a3', 'e7e5'] : ['a7a6', 'g1f3'] },
      ]
    }
    const plies = await analyseGame(game.tree, analyse, { depth: 10 })
    expect(new Set(counts)).toEqual(new Set([2]))
    expect(plies[0].second).toEqual({ san: 'a3', line: ['a3', 'e5'], score: { cp: -120 } })
    expect(plies[1].second).toEqual({ san: 'a6', line: ['a6', 'Nf3'], score: { cp: 120 } }) // Black to move: −120 for Black
  })

  it('stops when aborted', async () => {
    const ctrl = new AbortController()
    const analyse: AnalysePosition = async () => { ctrl.abort(); return [{ idx: 1, depth: 1, scoreCp: 0, pv: [] }] }
    await expect(analyseGame(game.tree, analyse, { depth: 5, signal: ctrl.signal })).rejects.toThrow('aborted')
  })
})

describe('hintsForSquare', () => {
  it('grades each destination of a piece against the best move in the position', () => {
    const fen = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'
    const lines = [
      { idx: 1, depth: 8, scoreCp: 40, pv: ['e2e4'] },
      { idx: 2, depth: 8, scoreCp: 30, pv: ['g1f3'] },
      { idx: 3, depth: 8, scoreCp: -60, pv: ['g1h3'] },
      { idx: 4, depth: 8, scoreCp: -400, pv: ['g2g4'] },
    ]
    expect(hintsForSquare(lines, fen, 'g1')).toEqual({ f3: 'good', h3: 'dubious' })
    expect(hintsForSquare(lines, fen, 'g2')).toEqual({ g4: 'bad' })
  })
})
