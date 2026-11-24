import { describe, expect, it, vi } from 'vitest'
import { bookChapterOrders, gameFileName, generateBookGames, joinPgns, type ChapterLoader } from './bookGames'

const TEXTS: Record<number, string> = {
  1: 'Intro\n\nAlpha Rook - Beta Knight 1950\n\n1. e4 e5 A calm start. 2. Nf3 *',
  2: 'No games here, only prose about rooks.',
  3: 'Gamma - Delta\n\n1. d4 d5 2. c4 *\n\nEpsilon - Zeta\n\n1. c4 e5 *',
}
const load: ChapterLoader = vi.fn(async (n: number) => {
  if (n === 4) throw new Error('boom')
  return { text: TEXTS[n] ?? '', title: `Chapter ${n}`, toc: n === 1 ? [{ order: 1, title: 'a' }, { order: 2, title: 'b' }, { order: 3, title: 'c' }, { order: 3, title: 'c2' }] : [] }
})
const book = { title: 'Invented Endings', author: 'A. Writer' }

describe('bookChapterOrders', () => {
  it('lists the distinct chapters of the table of contents, or just the first', async () => {
    expect(await bookChapterOrders(load)).toEqual([1, 2, 3])
    expect(await bookChapterOrders(async () => ({ text: '', title: '', toc: [] }))).toEqual([1])
  })
})

describe('generateBookGames', () => {
  it('collects every game of every chapter, reports progress and the chapters that failed', async () => {
    const progress: [number, number][] = []
    const { games, failedChapters } = await generateBookGames(book, [1, 2, 3, 4], load, { onProgress: (d, t) => progress.push([d, t]) })
    expect(games.map((g) => [g.chapter, g.gameIndex])).toEqual([[1, 0], [3, 0], [3, 1]])
    expect(failedChapters).toEqual([4])
    expect(progress).toEqual([[1, 4], [2, 4], [3, 4], [4, 4]])
    expect(games[0].pgn).toContain('{A calm start.}')
  })

  it('stops when cancelled', async () => {
    const ctrl = new AbortController()
    ctrl.abort()
    await expect(generateBookGames(book, [1], load, { signal: ctrl.signal })).rejects.toThrow('Cancelled')
  })
})

describe('joinPgns and gameFileName', () => {
  it('joins the games in one file and names each game file', async () => {
    const { games } = await generateBookGames(book, [1, 3], load)
    const all = joinPgns(games)
    expect(all.match(/\[Event /g)).toHaveLength(3)
    expect(all).toContain('\n\n[Event')
    expect(all.endsWith('\n')).toBe(true)
    expect(gameFileName(games[0])).toBe('ch01-game01 Alpha Rook - Beta Knight.pgn')
    expect(gameFileName({ ...games[1], white: '', black: '', chapter: 12, gameIndex: 9 })).toBe('ch12-game10.pgn')
  })
})
