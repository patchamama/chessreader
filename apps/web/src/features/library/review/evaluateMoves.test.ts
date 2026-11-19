import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Chess } from 'chess.js'
import { recognizeGames } from '@chess-ebook/chess-shared'
import type { AnalysePosition } from './reviewEngine'
import { evaluateChapterGames, evaluateWholeBook, rateGameMoves } from './evaluateMoves'
import { gameSignature, qualitiesOf, useEvalColoringStore } from '../store/evalColoringStore'

// reader-analysis-round S11: each move coloured by its evaluation, per game or for the whole book.

const TEXT = '1. e4 e5 2. Qh5 Ke7'
const fenAfter = (sans: string[]) => { const c = new Chess(); sans.forEach((m) => c.move(m)); return c.fen() }
const AFTER_KE7 = fenAfter(['e4', 'e5', 'Qh5', 'Ke7'])

/** An engine that finds every position level except after 2...Ke7, where White wins (side to move: White). */
const engine = (): AnalysePosition & { calls: number } => {
  const fn = (async (fen: string) => {
    fn.calls++
    return [{ idx: 1, pv: [], depth: 8, scoreCp: fen === AFTER_KE7 ? 900 : 0 }]
  }) as unknown as AnalysePosition & { calls: number }
  fn.calls = 0
  return fn
}

beforeEach(() => { localStorage.clear(); useEvalColoringStore.getState().reset() })

describe('rating the moves of a game', () => {
  it('rates each main-line move on the good / dubious / bad scale of the review', async () => {
    const [game] = recognizeGames(TEXT)
    const hints = await rateGameMoves(game.tree, engine(), { depth: 8 })
    expect(hints).toEqual(['good', 'good', 'good', 'bad'])
  })
})

describe('evaluating the games of a chapter', () => {
  it('stores the ratings per book, chapter and game, and reports progress by positions', async () => {
    const games = recognizeGames(TEXT)
    const steps: number[] = []
    await evaluateChapterGames(16, 3, games, { analyse: engine(), depth: 8, report: (done, total) => steps.push(done / (total ?? 1)) })
    expect(steps.at(-1)).toBe(1)
    const q = qualitiesOf(useEvalColoringStore.getState().entries, 16, 3, 0, games[0].tree)
    const [, , , ke7] = games[0].tree.mainline
    expect(q?.[ke7]).toBe('bad')
    // Kept in the browser: a new session reads them back.
    useEvalColoringStore.setState({ entries: {} })
    useEvalColoringStore.getState().load()
    expect(qualitiesOf(useEvalColoringStore.getState().entries, 16, 3, 0, games[0].tree)?.[ke7]).toBe('bad')
  })

  it('does not analyse a game again when its moves are the same, and ignores ratings of other moves', async () => {
    const games = recognizeGames(TEXT)
    const first = engine()
    await evaluateChapterGames(16, 3, games, { analyse: first, depth: 8 })
    const second = engine()
    await evaluateChapterGames(16, 3, games, { analyse: second, depth: 8 })
    expect(second.calls).toBe(0)
    const other = recognizeGames('1. d4 d5 2. c4 e6')
    expect(qualitiesOf(useEvalColoringStore.getState().entries, 16, 3, 0, other[0].tree)).toBeNull()
    expect(gameSignature(other[0].tree)).not.toBe(gameSignature(games[0].tree))
  })
})

describe('evaluating every move of the whole book', () => {
  it('goes through every chapter with its progress, and stops when cancelled', async () => {
    const load = vi.fn(async (chapter: number) => (chapter === 2 ? [] : recognizeGames(TEXT)))
    const steps: number[] = []
    await evaluateWholeBook(16, [1, 2, 3], load, { analyse: engine(), depth: 8, report: (f) => steps.push(f) })
    expect(load.mock.calls.map(([c]) => c)).toEqual([1, 2, 3])
    expect(steps.at(-1)).toBe(1)
    const games = recognizeGames(TEXT)
    expect(qualitiesOf(useEvalColoringStore.getState().entries, 16, 1, 0, games[0].tree)).not.toBeNull()
    expect(qualitiesOf(useEvalColoringStore.getState().entries, 16, 3, 0, games[0].tree)).not.toBeNull()

    useEvalColoringStore.getState().reset()
    const controller = new AbortController()
    controller.abort()
    await expect(evaluateWholeBook(16, [1, 3], load, { analyse: engine(), depth: 8, signal: controller.signal })).rejects.toThrow('aborted')
    expect(qualitiesOf(useEvalColoringStore.getState().entries, 16, 3, 0, games[0].tree)).toBeNull()
  })
})
