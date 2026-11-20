import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

vi.mock('../../shared/api/serverSession', () => ({ hasServerSession: vi.fn() }))
vi.mock('../../shared/api/httpClient', () => ({ httpClient: vi.fn() }))
vi.mock('../library/commentdb/commentLookup', async (orig) => ({
  ...(await orig<typeof import('../library/commentdb/commentLookup')>()),
  getJson: vi.fn(),
  resourcesConfigured: vi.fn(),
}))

import { hasServerSession } from '../../shared/api/serverSession'
import { httpClient } from '../../shared/api/httpClient'
import { getJson, resourcesConfigured } from '../library/commentdb/commentLookup'
import { useSettingsStore } from '../../shared/settings/settingsStore'
import { loadSuggestions, saveSuggestion, updateSuggestionStatus, withChapterSuggestions } from './suggestionsApi'
import { buildSuggestion, makeAnchor, type Suggestion } from './suggestionFormat'

const server = vi.mocked(hasServerSession)
const http = vi.mocked(httpClient)
const json = vi.mocked(getJson)
const repo = vi.mocked(resourcesConfigured)

const sample = (over: Partial<Suggestion> = {}): Suggestion => ({
  ...buildSuggestion({ kind: 'text', target: { book: 'Sample Book', chapter: 2 }, before: 'a', after: 'b', author: 'user' }),
  ...over,
})

function setStore(token: string, url = 'https://github.com/owner/res') {
  useSettingsStore.setState({ commentDbUrl: url, commentDbToken: 'read-token', resourcesWriteToken: token } as never)
}

const b64 = (s: string) => Buffer.from(s, 'utf8').toString('base64')

let fetchMock: ReturnType<typeof vi.fn>
beforeEach(() => {
  vi.resetAllMocks()
  fetchMock = vi.fn()
  vi.stubGlobal('fetch', fetchMock)
  setStore('')
})
afterEach(() => vi.unstubAllGlobals())

const res = (status: number, body: unknown = {}) => new Response(JSON.stringify(body), { status })

describe('saveSuggestion', () => {
  it('posts to the server when there is a session', async () => {
    server.mockReturnValue(true)
    http.mockResolvedValue({ ok: true })
    const s = sample()
    expect(await saveSuggestion(s)).toEqual({ saved: true, where: 'server', path: `suggestions/text/sample-book/${s.id}.json` })
    expect(http).toHaveBeenCalledWith('/api/suggestions', { method: 'POST', body: JSON.stringify(s) })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('without a server and a write token, commits the file and the index to GitHub, token only to api.github.com', async () => {
    server.mockReturnValue(false)
    setStore('write-token')
    const s = sample()
    const path = `suggestions/text/sample-book/${s.id}.json`
    const puts: Array<{ url: string; body: { content: string; sha?: string } }> = []
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      expect(new URL(url).hostname).toBe('api.github.com')
      expect((init?.headers as Record<string, string>).Authorization).toBe('Bearer write-token')
      if (init?.method === 'PUT') { puts.push({ url, body: JSON.parse(String(init.body)) }); return res(201) }
      if (url.endsWith('/suggestions/index.json')) return res(200, { sha: 'idx-sha', content: b64(JSON.stringify({ version: 1, entries: [{ id: 'old', kind: 'text', book: 'x', chapter: 1, path: 'text/x/old.json', status: 'pending' }] })) })
      return res(404, { message: 'Not Found' })
    })
    const out = await saveSuggestion(s)
    expect(out).toEqual({ saved: true, where: 'resources', path })
    expect(puts.map((p) => p.url)).toEqual([
      `https://api.github.com/repos/owner/res/contents/${path}`,
      'https://api.github.com/repos/owner/res/contents/suggestions/index.json',
    ])
    expect(puts[0].body.sha).toBeUndefined()
    expect(JSON.parse(Buffer.from(puts[0].body.content, 'base64').toString('utf8'))).toEqual(s)
    expect(puts[1].body.sha).toBe('idx-sha')
    const index = JSON.parse(Buffer.from(puts[1].body.content, 'base64').toString('utf8'))
    expect(index.entries).toEqual([
      { id: 'old', kind: 'text', book: 'x', chapter: 1, path: 'text/x/old.json', status: 'pending' },
      { id: s.id, kind: 'text', book: 'sample-book', chapter: 2, path: `text/sample-book/${s.id}.json`, status: 'pending' },
    ])
  })

  it('updates an existing file with its sha', async () => {
    server.mockReturnValue(false)
    setStore('write-token')
    const s = sample()
    const shas: Array<string | undefined> = []
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (init?.method === 'PUT') { shas.push(JSON.parse(String(init.body)).sha); return res(200) }
      if (url.endsWith('index.json')) return res(404)
      return res(200, { sha: 'file-sha', content: b64('{}') })
    })
    expect((await saveSuggestion(s)).saved).toBe(true)
    expect(shas).toEqual(['file-sha', undefined])
  })

  it('never sends the write token to a host other than api.github.com', async () => {
    server.mockReturnValue(false)
    setStore('write-token', 'https://example.org/resources')
    const out = await saveSuggestion(sample())
    expect(out.saved).toBe(false)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('without a server or a token, gives the JSON to download', async () => {
    server.mockReturnValue(false)
    const s = sample()
    const out = await saveSuggestion(s)
    expect(out).toEqual({ saved: false, path: `suggestions/text/sample-book/${s.id}.json`, json: JSON.stringify(s, null, 2) })
  })

  it('refuses an invalid suggestion without sending it', async () => {
    server.mockReturnValue(true)
    const out = await saveSuggestion(sample({ kind: 'bad' as never }))
    expect(out.saved).toBe(false)
    expect(http).not.toHaveBeenCalled()
  })
})

describe('loadSuggestions', () => {
  it('merges the server rows and the resources repository by id, tagging the origin', async () => {
    server.mockReturnValue(true)
    repo.mockReturnValue(true)
    const both = sample({ id: 'both', status: 'accepted' })
    const onlyServer = sample({ id: 'srv' })
    const onlyRepo = sample({ id: 'rep' })
    http.mockResolvedValue({ items: [both, onlyServer], total: 2 })
    json.mockImplementation(async (p: string) => {
      if (p === 'suggestions/index.json') return { version: 1, entries: [
        { id: 'both', kind: 'text', book: 'sample-book', chapter: 2, path: 'text/sample-book/both.json', status: 'pending' },
        { id: 'rep', kind: 'text', book: 'sample-book', chapter: 2, path: 'text/sample-book/rep.json', status: 'pending' },
        { id: 'other', kind: 'text', book: 'other-book', chapter: 2, path: 'text/other-book/other.json', status: 'pending' },
        { id: 'evil', kind: 'text', book: 'sample-book', chapter: 2, path: '../../x.json', status: 'pending' },
      ] }
      if (p === 'suggestions/text/sample-book/both.json') return { ...both, status: 'pending' }
      if (p === 'suggestions/text/sample-book/rep.json') return onlyRepo
      throw new Error(`unexpected ${p}`)
    })
    const out = await loadSuggestions({ book: 'Sample Book', chapter: 2 })
    expect(out.map((s) => [s.id, s.origin, s.origins, s.status])).toEqual([
      ['both', 'server', ['server', 'resources'], 'accepted'],
      ['srv', 'server', ['server'], 'pending'],
      ['rep', 'resources', ['resources'], 'pending'],
    ])
    expect(http).toHaveBeenCalledWith('/api/suggestions?book=sample-book&chapter=2&offset=0&limit=500', { method: 'GET' })
  })

  it('filters repository files by status and survives failures of both sources', async () => {
    server.mockReturnValue(true)
    repo.mockReturnValue(true)
    http.mockRejectedValue(new Error('500'))
    json.mockImplementation(async (p: string) => {
      if (p === 'suggestions/index.json') return { version: 1, entries: [{ id: 'a', kind: 'text', book: 'sample-book', chapter: 2, path: 'text/sample-book/a.json', status: 'pending' }] }
      return sample({ id: 'a', status: 'rejected' })
    })
    expect(await loadSuggestions({ status: 'accepted' })).toEqual([])
    json.mockRejectedValue(new Error('404'))
    expect(await loadSuggestions({})).toEqual([])
  })
})

describe('updateSuggestionStatus', () => {
  it('patches the server copy', async () => {
    server.mockReturnValue(true)
    http.mockResolvedValue({ ok: true })
    const out = await updateSuggestionStatus({ ...sample({ id: 'x' }), origin: 'server', origins: ['server'] }, 'accepted')
    expect(out).toEqual({ ok: true, updated: ['server'] })
    expect(http).toHaveBeenCalledWith('/api/suggestions/x', { method: 'PATCH', body: '{"status":"accepted"}' })
  })

  it('never sends the write token for a path outside suggestions/', async () => {
    server.mockReturnValue(false)
    setStore('write-token')
    const s = { ...sample({ id: 'x', kind: '../../x' as never }), origin: 'resources' as const, origins: ['resources' as const] }
    const out = await updateSuggestionStatus(s, 'rejected')
    expect(out.ok).toBe(false)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('without a place to write, gives the updated JSON to download', async () => {
    server.mockReturnValue(false)
    const s = { ...sample({ id: 'x' }), origin: 'resources' as const, origins: ['resources' as const] }
    const out = await updateSuggestionStatus(s, 'rejected')
    expect(out.ok).toBe(false)
    expect(JSON.parse(out.json!).status).toBe('rejected')
  })
})

describe('withChapterSuggestions', () => {
  it('applies the accepted suggestions of the book and chapter and never throws', async () => {
    server.mockReturnValue(true)
    repo.mockReturnValue(false)
    const html = '<p>Placeholder paragraph one.</p><p>Placeholder paragraph two.</p>'
    const s = sample({ id: 'fix', status: 'accepted', target: { book: 'Sample Book', chapter: 2, anchor: makeAnchor(2, 1, 'Placeholder paragraph two.') }, after: 'Fixed two.' })
    http.mockResolvedValue({ items: [s], total: 1 })
    const out = await withChapterSuggestions(html, 'Sample Book', 2)
    expect(out.html).toBe('<p>Placeholder paragraph one.</p><p>Fixed two.</p>')
    expect(out.suggestions).toEqual({ applied: ['fix'], stale: [] })
    expect(http).toHaveBeenCalledWith('/api/suggestions?book=sample-book&status=accepted&chapter=2&offset=0&limit=500', { method: 'GET' })

    http.mockRejectedValue(new Error('boom'))
    expect(await withChapterSuggestions(html, 'Sample Book', 2)).toEqual({ html, suggestions: { applied: [], stale: [] } })
    expect(await withChapterSuggestions(html, null, 2)).toEqual({ html, suggestions: { applied: [], stale: [] } })
  })
})
