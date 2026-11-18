import { afterEach, describe, expect, it, vi } from 'vitest'
import { useSettingsStore, migrateSettings, DEFAULT_RESOURCES_URL } from '../../../shared/settings/settingsStore'
import { checkResources, getJson, resourcesConfigured, resourcesApiUrl } from './commentLookup'

describe('private resources repository in Settings', () => {
  afterEach(() => { vi.unstubAllGlobals(); useSettingsStore.setState({ commentDbUrl: DEFAULT_RESOURCES_URL, commentDbToken: '' }) })

  it('defaults to https://github.com/patchamama/chessreader-resources, and old empty settings get it too', () => {
    expect(DEFAULT_RESOURCES_URL).toBe('https://github.com/patchamama/chessreader-resources')
    expect(useSettingsStore.getState().commentDbUrl).toBe(DEFAULT_RESOURCES_URL)
    expect(migrateSettings({ commentDbUrl: '' }, 2).commentDbUrl).toBe(DEFAULT_RESOURCES_URL)
    expect(migrateSettings({ commentDbUrl: 'https://example.org/db' }, 2).commentDbUrl).toBe('https://example.org/db')
  })

  it('reads a github.com repository URL through the contents API (github.com itself has no CORS)', async () => {
    expect(resourcesApiUrl('https://github.com/patchamama/chessreader-resources')).toBe('https://api.github.com/repos/patchamama/chessreader-resources/contents')
    expect(resourcesApiUrl('https://github.com/a/b.git/')).toBe('https://api.github.com/repos/a/b/contents')
    expect(resourcesApiUrl('https://github.com/a/b/tree/main')).toBe('https://api.github.com/repos/a/b/contents')
    expect(resourcesApiUrl('https://api.github.com/repos/a/b/contents/')).toBe('https://api.github.com/repos/a/b/contents')
    expect(resourcesApiUrl('https://example.org/db/')).toBe('https://example.org/db')
    useSettingsStore.setState({ commentDbUrl: 'https://github.com/a/b', commentDbToken: 't' })
    const fetchMock = vi.fn(async () => new Response('[1]'))
    vi.stubGlobal('fetch', fetchMock)
    await getJson('books.json')
    expect(fetchMock).toHaveBeenCalledWith('https://api.github.com/repos/a/b/contents/books.json', expect.objectContaining({ headers: expect.objectContaining({ Authorization: 'Bearer t' }) }))
  })

  it('a GitHub repository without a token is not read (it is private): no failing requests', () => {
    useSettingsStore.setState({ commentDbUrl: DEFAULT_RESOURCES_URL, commentDbToken: '' })
    expect(resourcesConfigured()).toBe(false)
    useSettingsStore.setState({ commentDbToken: 'ghp_x' })
    expect(resourcesConfigured()).toBe(true)
    useSettingsStore.setState({ commentDbUrl: 'https://example.org/db', commentDbToken: '' })
    expect(resourcesConfigured()).toBe(true)
  })

  it('checks that the URL and the token work, with a clear message', async () => {
    useSettingsStore.setState({ commentDbUrl: DEFAULT_RESOURCES_URL, commentDbToken: 'ghp_x' })
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify([{ id: 'a' }, { id: 'b' }]))))
    expect(await checkResources()).toEqual({ ok: true, message: '✓ 2 books' })
    vi.stubGlobal('fetch', vi.fn(async () => new Response('', { status: 401 })))
    expect(await checkResources()).toEqual({ ok: false, message: 'The token was rejected (401): check it or create a new one.' })
    vi.stubGlobal('fetch', vi.fn(async () => new Response('', { status: 404 })))
    expect((await checkResources()).message).toBe('Repository not found (404): check the URL, and that the token can read this repository.')
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('Failed to fetch') }))
    expect((await checkResources()).message).toBe('Could not reach the repository: Failed to fetch')
  })
})

describe('token for the resources repository (S1)', () => {
  it('links to GitHub with a fine-grained token prefilled for that repository owner, read-only contents', async () => {
    const { resourcesTokenUrl } = await import('./commentLookup')
    const url = new URL(resourcesTokenUrl('https://github.com/patchamama/chessreader-resources')!)
    expect(url.origin + url.pathname).toBe('https://github.com/settings/personal-access-tokens/new')
    expect(Object.fromEntries(url.searchParams)).toEqual({
      name: 'ChessReader chessreader-resources', description: 'Read chessreader-resources from ChessReader',
      target_name: 'patchamama', expires_in: '365', contents: 'read',
    })
    expect(resourcesTokenUrl('https://example.org/db')).toBeNull()
  })
})
