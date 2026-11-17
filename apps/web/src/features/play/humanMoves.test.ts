import { afterEach, describe, expect, it, vi } from 'vitest'
import { humanMoves } from './humanMoves'
import { useAuthStore } from '../auth/store/authStore'

const FEN = 'rnbqkbnr/pppp1ppp/8/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R b KQkq - 1 2'

afterEach(() => { vi.unstubAllGlobals(); useAuthStore.setState({ token: null }) })

describe('humanMoves (S7)', () => {
  it('asks the server what a player of the rating would play, as moves with their probability', async () => {
    useAuthStore.setState({ token: 'jwt' })
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ rating: 1500, moves: [{ uci: 'b8c6', probability: 0.5 }, { uci: 'd7d6', probability: 0.25 }], ratings: [1100, 1500, 1900] }), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)
    await expect(humanMoves(FEN, 1600)).resolves.toEqual({ rating: 1500, moves: [{ san: 'Nc6', probability: 0.5 }, { san: 'd6', probability: 0.25 }] })
    expect((fetchMock.mock.calls[0] as unknown as [string])[0]).toBe(`/api/engine/human?fen=${encodeURIComponent(FEN)}&rating=1600&limit=3`)
  })

  it('without a server or without Maia there is nothing', async () => {
    await expect(humanMoves(FEN, 1500)).resolves.toBeNull()
    useAuthStore.setState({ token: 'jwt' })
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{"error":"Maia is not installed on this server."}', { status: 503 })))
    await expect(humanMoves(FEN, 1500)).resolves.toBeNull()
  })
})
