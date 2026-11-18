import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../../../shared/api/serverSession', () => ({ hasServerSession: vi.fn() }))
vi.mock('../../../shared/api/httpClient', () => ({ httpClient: vi.fn() }))
vi.mock('../commentdb/commentLookup', () => ({ getJson: vi.fn(), resourcesConfigured: vi.fn() }))

import { hasServerSession } from '../../../shared/api/serverSession'
import { httpClient } from '../../../shared/api/httpClient'
import { getJson, resourcesConfigured } from '../commentdb/commentLookup'
import { fetchChapterErrata, saveErrata } from './errataSource'
import { SAMPLE } from './errataFixture'

const server = vi.mocked(hasServerSession)
const http = vi.mocked(httpClient)
const json = vi.mocked(getJson)
const repo = vi.mocked(resourcesConfigured)

beforeEach(() => vi.resetAllMocks())

describe('fetchChapterErrata', () => {
  it('asks the server for the book and chapter', async () => {
    server.mockReturnValue(true)
    http.mockResolvedValue({ entries: [SAMPLE] })
    expect(await fetchChapterErrata('Smith Games', 2)).toEqual([SAMPLE])
    expect(http).toHaveBeenCalledWith('/api/errata?book=smith-games&chapter=2', { method: 'GET' })
  })

  it('without a server, reads errata/index.json of the resources repository and the matching files', async () => {
    server.mockReturnValue(false)
    repo.mockReturnValue(true)
    json.mockImplementation(async (path: string) => {
      if (path === 'errata/index.json') {
        return { version: 1, entries: [
          { book: 'smith-games', chapter: 2, gameIndex: 0, path: 'smith-games/2-0.json' },
          { book: 'smith-games', chapter: 3, gameIndex: 0, path: 'smith-games/3-0.json' },
          { book: 'other', chapter: 2, gameIndex: 0, path: 'other/2-0.json' },
        ] }
      }
      if (path === 'errata/smith-games/2-0.json') return SAMPLE
      throw new Error('404')
    })
    expect(await fetchChapterErrata('Smith Games', 2)).toEqual([SAMPLE])
    expect(json).toHaveBeenCalledTimes(2)
  })

  it('falls back to the repository when the server has none, and never throws', async () => {
    server.mockReturnValue(true)
    http.mockRejectedValue(new Error('500'))
    repo.mockReturnValue(true)
    json.mockRejectedValue(new Error('404'))
    expect(await fetchChapterErrata('Smith Games', 2)).toEqual([])
  })

  it('drops entries that are not valid', async () => {
    server.mockReturnValue(true)
    http.mockResolvedValue({ entries: [SAMPLE, { id: 'bad' }] })
    expect(await fetchChapterErrata('Smith Games', 2)).toEqual([SAMPLE])
  })
})

describe('saveErrata', () => {
  it('posts the entry to the server', async () => {
    server.mockReturnValue(true)
    http.mockResolvedValue({ ok: true, path: 'smith-games/2-0.json' })
    expect(await saveErrata(SAMPLE)).toEqual({ saved: true, path: 'smith-games/2-0.json' })
    expect(http).toHaveBeenCalledWith('/api/errata', { method: 'POST', body: JSON.stringify(SAMPLE) })
  })

  it('without a server, gives the JSON to copy into the resources repository', async () => {
    server.mockReturnValue(false)
    const r = await saveErrata(SAMPLE)
    expect(r).toMatchObject({ saved: false, path: 'errata/smith-games/2-0.json' })
    if (!r.saved) expect(JSON.parse(r.json)).toEqual(SAMPLE)
  })

  it('when the server refuses, also gives the JSON with the reason', async () => {
    server.mockReturnValue(true)
    http.mockRejectedValue(new Error('invalid errata entry'))
    expect(await saveErrata(SAMPLE)).toMatchObject({ saved: false, reason: 'invalid errata entry' })
  })
})
