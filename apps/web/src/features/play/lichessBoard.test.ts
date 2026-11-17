import { describe, it, expect, vi, afterEach } from 'vitest'
import { readNdjson, lichessMakeMove, lichessSeek, lichessChallengeAi, lichessTokenUrl, LICHESS_PLAY_TOKEN_URL, LICHESS_CLOCKS } from './lichessBoard'

afterEach(() => vi.unstubAllGlobals())

function streamOf(chunks: string[]) {
  const enc = new TextEncoder()
  return new ReadableStream<Uint8Array>({ start(c) { for (const x of chunks) c.enqueue(enc.encode(x)); c.close() } })
}

describe('Lichess Board API', () => {
  it('reads an ndjson stream split across chunks, skipping keep-alive lines', async () => {
    const seen: unknown[] = []
    await readNdjson(streamOf(['{"type":"gameFull","id":"ab', 'c"}\n\n{"type":"gameState","moves":"e2e4"}\n']), (x) => seen.push(x))
    expect(seen).toEqual([{ type: 'gameFull', id: 'abc' }, { type: 'gameState', moves: 'e2e4' }])
  })
  it('sends a move with the token', async () => {
    const f = vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ ok: true }) }))
    vi.stubGlobal('fetch', f)
    await lichessMakeMove('tok', 'g1', 'e2e4')
    expect(f).toHaveBeenCalledWith('https://lichess.org/api/board/game/g1/move/e2e4', { method: 'POST', headers: { Authorization: 'Bearer tok' } })
  })
  it('seeks a casual (unrated) game', async () => {
    const f = vi.fn(async () => ({ ok: true, status: 200, body: streamOf([]) }))
    vi.stubGlobal('fetch', f)
    await lichessSeek('tok', { minutes: 10, increment: 5 }, new AbortController().signal)
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('https://lichess.org/api/board/seek')
    expect(String(init.body)).toBe('rated=false&time=10&increment=5')
  })
  it('a 401 says the token needs the board:play permission', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 401 })))
    await expect(lichessMakeMove('tok', 'g1', 'e2e4')).rejects.toThrow(/board:play/)
    expect(LICHESS_PLAY_TOKEN_URL).toContain('scopes[]=board:play')
  })
  it('challenges the Lichess AI at a level and clock, with my colour, and returns the game id', async () => {
    const f = vi.fn(async () => ({ ok: true, status: 201, json: async () => ({ id: 'icLVdl9f', status: { name: 'started' } }) }))
    vi.stubGlobal('fetch', f)
    await expect(lichessChallengeAi('tok', { level: 3, clock: { minutes: 15, increment: 10 }, color: 'black' })).resolves.toBe('icLVdl9f')
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('https://lichess.org/api/challenge/ai')
    expect(init.headers).toEqual({ Authorization: 'Bearer tok', 'Content-Type': 'application/x-www-form-urlencoded' })
    expect(String(init.body)).toBe('level=3&clock.limit=900&clock.increment=10&color=black')
  })
  it('the token page opens with the permissions already ticked and a description', () => {
    expect(lichessTokenUrl(['board:play', 'challenge:write'], 'Chess reader play'))
      .toBe('https://lichess.org/account/oauth/token/create?scopes[]=board:play&scopes[]=challenge:write&description=Chess+reader+play')
    expect(LICHESS_PLAY_TOKEN_URL).toContain('scopes[]=challenge:write')
  })
  it('offers the usual clocks, 10+5 first (the default)', () => {
    expect(LICHESS_CLOCKS[0]).toEqual({ minutes: 10, increment: 5 })
    expect(LICHESS_CLOCKS).toContainEqual({ minutes: 5, increment: 3 })
    expect(LICHESS_CLOCKS).toContainEqual({ minutes: 30, increment: 0 })
  })
})
