import { afterEach, describe, expect, it, vi } from 'vitest'
import { bookMove, clearOpeningBook } from './openingBook'

const AFTER_E4 = 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1'
const AFTER_E4_E5 = 'rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2'
const AFTER_E4_A5 = 'rnbqkbnr/1ppppppp/8/p7/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2'
const ECO = {
  'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq -': ['B00', "King's Pawn Game"],
  'rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq -': ['C20', "King's Pawn Game"],
}

describe('bookMove', () => {
  afterEach(() => { vi.unstubAllGlobals(); clearOpeningBook() })

  it('a move that reaches a named opening position is a book move, with its name (offline table)', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(ECO), { status: 200 })))
    await expect(bookMove(AFTER_E4, 'e7e5', AFTER_E4_E5)).resolves.toEqual({ eco: 'C20', name: "King's Pawn Game", source: 'eco' })
    await expect(bookMove(AFTER_E4, 'a7a5', AFTER_E4_A5)).resolves.toBeNull()
  })

  it('with a token, a move masters played is a book move too (Lichess masters explorer)', async () => {
    const fetchMock = vi.fn(async (url: string) =>
      url.includes('explorer')
        ? new Response(JSON.stringify({ moves: [{ uci: 'a7a5', white: 1, draws: 0, black: 2 }], opening: null }), { status: 200 })
        : new Response(JSON.stringify(ECO), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)
    await expect(bookMove(AFTER_E4, 'a7a5', AFTER_E4_A5, 'tok')).resolves.toEqual({ eco: '', name: 'played in 3 master games', source: 'masters' })
  })
})
