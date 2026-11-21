import { describe, it, expect, vi, beforeEach } from 'vitest'

const getJson = vi.fn()
const writeResourceFile = vi.fn()
const canWriteResources = vi.fn()
vi.mock('../commentdb/commentLookup', () => ({ getJson: (...a: unknown[]) => getJson(...a) }))
vi.mock('../../suggestions/suggestionsApi', () => ({
  canWriteResources: () => canWriteResources(),
  writeResourceFile: (...a: unknown[]) => writeResourceFile(...a),
}))
vi.mock('../../../shared/api/serverSession', () => ({ hasServerSession: () => false }))

import { loadBookStats, saveBookStats, statsPath } from './bookStats'

const S = { games: 3, plies: 100, variations: 4, comments: 0, errors: 1, analysedAt: '2026-11-21T10:00:00.000Z', version: '0.136.0' }
beforeEach(() => { vi.clearAllMocks(); localStorage.clear() })

describe('stats of a book of the resources repository', () => {
  it('lives under suggestions/stats/<slug>/ (the only place the write token may use)', () => {
    expect(statsPath('My Chess Book!')).toBe('suggestions/stats/my-chess-book/stats.json')
  })

  it('is written to the repository when the write token is set', async () => {
    canWriteResources.mockReturnValue(true)
    await saveBookStats('book-1', S, 'My Book')
    expect(writeResourceFile).toHaveBeenCalledWith('suggestions/stats/my-book/stats.json', expect.stringContaining('"games":3'), expect.stringContaining('My Book'))
  })

  it('is kept only in this browser without the token, and read back from there', async () => {
    canWriteResources.mockReturnValue(false)
    getJson.mockRejectedValue(new Error('404'))
    await saveBookStats('book-1', S, 'My Book')
    expect(writeResourceFile).not.toHaveBeenCalled()
    expect(await loadBookStats('book-1', 'My Book')).toEqual(S)
  })

  it('is read from the repository first', async () => {
    getJson.mockResolvedValue(S)
    expect(await loadBookStats('book-9', 'Other Book')).toEqual(S)
    expect(getJson).toHaveBeenCalledWith('suggestions/stats/other-book/stats.json')
  })
})
