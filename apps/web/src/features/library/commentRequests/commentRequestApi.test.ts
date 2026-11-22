import { describe, it, expect, vi, beforeEach } from 'vitest'

const hasServerSession = vi.fn()
const httpClient = vi.fn()
const canWriteResources = vi.fn()
const writeResourceFile = vi.fn()
vi.mock('../../../shared/api/serverSession', () => ({ hasServerSession: () => hasServerSession() }))
vi.mock('../../../shared/api/httpClient', () => ({ httpClient: (...a: unknown[]) => httpClient(...a) }))
vi.mock('../../suggestions/suggestionsApi', () => ({
  canWriteResources: () => canWriteResources(),
  writeResourceFile: (...a: unknown[]) => writeResourceFile(...a),
}))

import { requestBookComments, cancelBookCommentRequest } from './commentRequestApi'

const BOOK = { id: 7, title: 'My Chess Book!', language: 'en' }
beforeEach(() => { vi.clearAllMocks(); hasServerSession.mockReturnValue(false); canWriteResources.mockReturnValue(false) })

describe('requestBookComments', () => {
  it('posts to the server when there is a session', async () => {
    hasServerSession.mockReturnValue(true)
    httpClient.mockResolvedValue({ request: { id: 3, status: 'pending' } })
    const r = await requestBookComments(BOOK, 'please')
    expect(httpClient).toHaveBeenCalledWith('/api/library/books/7/comment-request', { method: 'POST', body: JSON.stringify({ note: 'please' }) })
    expect(r).toEqual({ saved: true, where: 'server', status: 'pending' })
  })

  it('writes a JSON file to the resources repository when there is no server', async () => {
    canWriteResources.mockReturnValue(true)
    writeResourceFile.mockResolvedValue(undefined)
    const r = await requestBookComments(BOOK, 'hi')
    expect(r).toMatchObject({ saved: true, where: 'resources' })
    const [path, text] = writeResourceFile.mock.calls[0] as [string, string]
    expect(path).toMatch(/^suggestions\/book-comments\/my-chess-book\/[A-Za-z0-9._-]+\.json$/)
    expect(JSON.parse(text)).toMatchObject({ kind: 'book-comments', book: 'My Chess Book!', language: 'en', note: 'hi' })
    expect(JSON.parse(text).requestedAt).toEqual(expect.any(String))
  })

  it('offers the JSON to download when nothing can store it', async () => {
    const r = await requestBookComments(BOOK, '')
    expect(r.saved).toBe(false)
    if (!r.saved) {
      expect(r.path).toMatch(/^suggestions\/book-comments\/my-chess-book\//)
      expect(JSON.parse(r.json)).toMatchObject({ kind: 'book-comments', book: 'My Chess Book!' })
    }
  })

  it('falls back to the resources repository, then to the download, reporting why', async () => {
    hasServerSession.mockReturnValue(true)
    httpClient.mockRejectedValue(new Error('boom'))
    canWriteResources.mockReturnValue(true)
    writeResourceFile.mockRejectedValue(new Error('403'))
    const r = await requestBookComments(BOOK, '')
    expect(r).toMatchObject({ saved: false, reason: '403' })
  })
})

describe('cancelBookCommentRequest', () => {
  it('deletes the pending request on the server', async () => {
    httpClient.mockResolvedValue({ ok: true })
    await cancelBookCommentRequest(7)
    expect(httpClient).toHaveBeenCalledWith('/api/library/books/7/comment-request', { method: 'DELETE' })
  })
})
