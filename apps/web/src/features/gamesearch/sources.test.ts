import { afterEach, describe, expect, it, vi } from 'vitest'
import { lichessMasterPgn } from './sources'

describe('lichessMasterPgn', () => {
  afterEach(() => vi.unstubAllGlobals())
  it('downloads the game from the masters explorer (explorer.lichess.ovh/masters/pgn/<id>) with the token', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('[White "A"]\n\n1. e4 1-0\n', { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)
    await expect(lichessMasterPgn('dfYKaW8J-test', 'tok')).resolves.toContain('1. e4')
    expect(fetchMock).toHaveBeenCalledWith('https://explorer.lichess.ovh/masters/pgn/dfYKaW8J-test', { headers: { Authorization: 'Bearer tok' } })
  })
})
