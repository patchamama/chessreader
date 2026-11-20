import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../shared/api/serverSession', () => ({ hasServerSession: vi.fn() }))
vi.mock('../../shared/api/httpClient', () => ({ httpClient: vi.fn() }))
vi.mock('../library/commentdb/commentLookup', () => ({ getJson: vi.fn(), resourcesConfigured: vi.fn() }))

import { hasServerSession } from '../../shared/api/serverSession'
import { httpClient } from '../../shared/api/httpClient'
import { getJson, resourcesConfigured } from '../library/commentdb/commentLookup'
import { SAMPLE } from '../library/errata/errataFixture'
import { loadErrataForReview } from './errataReview'

beforeEach(() => vi.resetAllMocks())

describe('errata in the suggestions review (S5: kind move)', () => {
  it('merges the server and the resources errata by id, the server copy first', async () => {
    vi.mocked(hasServerSession).mockReturnValue(true)
    vi.mocked(resourcesConfigured).mockReturnValue(true)
    vi.mocked(httpClient).mockResolvedValue({ entries: [SAMPLE, { id: 'broken' }] })
    const other = { ...SAMPLE, id: 'smith-games-3-0', chapter: 3 }
    vi.mocked(getJson).mockImplementation(async (path: string) => (path === 'errata/index.json'
      ? { version: 1, entries: [
        { book: 'smith-games', chapter: 2, gameIndex: 0, path: 'smith-games/2-0.json' },
        { book: 'smith-games', chapter: 3, gameIndex: 0, path: 'smith-games/3-0.json' },
        { book: 'smith-games', chapter: 9, gameIndex: 0, path: '../escape.json' },
      ] }
      : path.endsWith('2-0.json') ? SAMPLE : other) as never)
    const list = await loadErrataForReview(['Smith Games'])
    expect(list.map((e) => [e.id, e.origin])).toEqual([['smith-games-2-0', 'server'], ['smith-games-3-0', 'resources']])
    expect(httpClient).toHaveBeenCalledWith('/api/errata?book=smith-games', { method: 'GET' })
    expect(getJson).not.toHaveBeenCalledWith('errata/../escape.json')
  })

  it('never throws', async () => {
    vi.mocked(hasServerSession).mockReturnValue(true)
    vi.mocked(resourcesConfigured).mockReturnValue(true)
    vi.mocked(httpClient).mockRejectedValue(new Error('down'))
    vi.mocked(getJson).mockRejectedValue(new Error('404'))
    expect(await loadErrataForReview(['Smith Games'])).toEqual([])
  })
})
