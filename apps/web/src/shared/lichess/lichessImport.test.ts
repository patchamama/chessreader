import { afterEach, describe, expect, it, vi } from 'vitest'
import { lichessImportGame } from './lichessImport'

describe('lichessImportGame', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('imports the PGN into Lichess and gives the analysis board address', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('{"id":"R6iLjwz5","url":"https://lichess.org/R6iLjwz5"}', { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)
    await expect(lichessImportGame('1. e4 e5 *', 'tok')).resolves.toBe('https://lichess.org/R6iLjwz5')
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('https://lichess.org/api/import')
    expect(init.method).toBe('POST')
    expect(init.headers).toEqual({ 'Content-Type': 'application/x-www-form-urlencoded', Authorization: 'Bearer tok', Accept: 'application/json' })
    expect(String(init.body)).toBe('pgn=1.+e4+e5+*')
  })

  it('works without a token and explains a refusal', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{"error":"Invalid PGN"}', { status: 400 })))
    await expect(lichessImportGame('nonsense')).rejects.toThrow('Lichess could not import the game: Invalid PGN')
  })
})
