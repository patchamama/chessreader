import { afterEach, describe, expect, it, vi } from 'vitest'
import { lichessBroadcastPgn, lichessGamePgn } from './sources'

describe('open Lichess games in the study (S7)', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('reads a Lichess game and a whole tournament as PGN', async () => {
    const urls: string[] = []
    vi.stubGlobal('fetch', vi.fn(async (url: string) => { urls.push(url); return new Response('[Event "x"]\n\n1. e4 e5 *') }))
    expect(await lichessGamePgn('AbCd1234')).toContain('1. e4 e5')
    expect(await lichessBroadcastPgn('tour42')).toContain('[Event "x"]')
    expect(urls).toEqual(['https://lichess.org/game/export/AbCd1234?clocks=false&evals=false', 'https://lichess.org/api/broadcast/tour42.pgn'])
  })
})
