import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { positionHash } from '@chess-ebook/chess-shared'
import { clearCommentCache, humanCommentsForGame, lookupPositionComments } from './commentLookup'
import { useSettingsStore } from '../../../shared/settings/settingsStore'
import { useAuthStore } from '../../auth/store/authStore'

// These tests run without a server (jsdom's host is localhost, where the app would ask it).
vi.mock('../../../shared/api/serverSession', () => ({ hasServerSession: () => false }))


const FEN = 'r1bqkbnr/pppp1ppp/2n5/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 2 3'
const HASH = positionHash(FEN)
const SHARD = {
  [HASH]: [
    { id: 2, text: 'A study remark.', lang: 'en', game: '18-1', ply: 4, san: 'Nc6', source: 18, label: 'A – B' },
    { id: 1, text: 'El caballo defiende el peón de e5.', lang: 'es', game: '3-7', ply: 4, san: 'Nc6', source: 3, label: 'Partida 7' },
  ],
}
const INDEX = { version: 1, sources: { 3: { kind: 'book', title: 'Mis geniales predecesores III', author: 'Garry Kasparov', lang: 'es', priority: 1 }, 18: { kind: 'lichess', title: 'Lichess studies', author: null, lang: 'en', priority: 2 } } }

beforeEach(() => {
  clearCommentCache()
  useAuthStore.setState({ token: null })
  useSettingsStore.getState().reset()
})
afterEach(() => vi.unstubAllGlobals())

describe('lookupPositionComments (S5–S6)', () => {
  it('reads the shard of the position from a private GitHub repository with a token, books first', async () => {
    useSettingsStore.setState({ commentDbUrl: 'https://api.github.com/repos/me/chess-comments/contents', commentDbToken: 'ghp_x' })
    const fetchMock = vi.fn(async (url: string) => new Response(JSON.stringify(url.endsWith('index.json') ? INDEX : SHARD), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)
    const found = await lookupPositionComments(FEN)
    expect(found.map((c) => c.text)).toEqual(['El caballo defiende el peón de e5.', 'A study remark.'])
    expect(found[0].source).toEqual({ kind: 'book', title: 'Mis geniales predecesores III', author: 'Garry Kasparov' })
    expect(fetchMock).toHaveBeenCalledWith(`https://api.github.com/repos/me/chess-comments/contents/p/${HASH.slice(0, 2)}.json`,
      { headers: { Accept: 'application/vnd.github.raw+json', Authorization: 'Bearer ghp_x' } })
  })

  it('the GitHub token is never sent to another host', async () => {
    useSettingsStore.setState({ commentDbUrl: 'https://evil.example/db', commentDbToken: 'ghp_x' })
    const fetchMock = vi.fn(async (url: string) => new Response(JSON.stringify(url.endsWith('index.json') ? INDEX : SHARD), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)
    await lookupPositionComments(FEN)
    for (const call of fetchMock.mock.calls as unknown as [string, RequestInit?][]) expect(JSON.stringify(call[1] ?? {})).not.toContain('ghp_x')
  })

  it('without a database configured there are no comments and nothing is asked', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    await expect(lookupPositionComments(FEN)).resolves.toEqual([])
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

describe('humanCommentsForGame (S5)', () => {
  it('borrows one remark per position after the opening, in the language of the reader first, with where it comes from', async () => {
    useSettingsStore.setState({ commentDbUrl: 'https://example.org/db' })
    vi.stubGlobal('fetch', vi.fn(async (url: string) => new Response(JSON.stringify(url.endsWith('index.json') ? INDEX : SHARD), { status: 200 })))
    const plies = Array.from({ length: 12 }, (_, i) => ({ fenAfter: i === 9 ? FEN : `8/8/8/8/8/8/8/K${i}k w - - 0 1` }))
    const human = await humanCommentsForGame(plies, 'es')
    expect(human).toEqual({ 10: { text: 'El caballo defiende el peón de e5.', source: 'Kasparov, Mis geniales predecesores III, Partida 7' } })
  })
})

describe('translated comments reach the reader (llm-assistant-round S3/S12)', () => {
  it('a comment translated into the reader\'s language is used in that language, keeping its source', async () => {
    useSettingsStore.setState({ commentDbUrl: 'https://example.org/db' })
    const shard = { [HASH]: [{ id: 2, text: 'A study remark.', lang: 'en', game: '18-1', ply: 4, san: 'Nc6', source: 18, label: 'A – B', translations: { de: 'Eine Studienbemerkung.' } }] }
    vi.stubGlobal('fetch', vi.fn(async (url: string) => new Response(JSON.stringify(url.endsWith('index.json') ? INDEX : shard), { status: 200 })))
    const plies = Array.from({ length: 12 }, (_, i) => ({ fenAfter: i === 9 ? FEN : `8/8/8/8/8/8/8/K${i}k w - - 0 1` }))
    expect(await humanCommentsForGame(plies, 'de')).toEqual({ 10: { text: 'Eine Studienbemerkung.', source: 'Lichess studies, A – B' } })
    clearCommentCache()
    expect(await humanCommentsForGame(plies, 'es')).toEqual({ 10: { text: 'A study remark.', source: 'Lichess studies, A – B' } })
  })
})

describe('the sample repository is the default (llm-assistant-round S12)', () => {
  it('with no resources URL set, the public sample repository is read, without any token', async () => {
    useSettingsStore.setState({ commentDbUrl: '', commentDbToken: 'ghp_x' })
    const fetchMock = vi.fn(async (url: string) => new Response(JSON.stringify(url.endsWith('index.json') ? INDEX : SHARD), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)
    const found = await lookupPositionComments(FEN)
    expect(found.map((c) => c.text)).toContain('A study remark.')
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit | undefined]
    expect(url).toBe('https://raw.githubusercontent.com/patchamama/chessreader-resources-sample/main/index.json')
    expect(init?.headers).toBeUndefined()
  })
  it('a URL set in Settings wins over the default', async () => {
    useSettingsStore.setState({ commentDbUrl: 'https://example.org/db' })
    const fetchMock = vi.fn(async (url: string) => new Response(JSON.stringify(url.endsWith('index.json') ? INDEX : SHARD), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)
    await lookupPositionComments(FEN)
    expect((fetchMock.mock.calls[0] as unknown as [string])[0]).toBe('https://example.org/db/index.json')
  })
})

describe('universal and dropped comments (llm-assistant-round S12)', () => {
  const universalShard = (translations: Record<string, string>) => ({ [HASH]: [{ id: 2, text: 'Caruana grabs it, as Naka did earlier.', lang: 'en', game: '18-1', ply: 4, san: 'Nc6', source: 18, label: 'A – B', translations }] })
  const serve = (shard: unknown) => vi.stubGlobal('fetch', vi.fn(async (url: string) => new Response(JSON.stringify(url.endsWith('index.json') ? INDEX : shard), { status: 200 })))
  const plies = Array.from({ length: 12 }, (_, i) => ({ fenAfter: i === 9 ? FEN : `8/8/8/8/8/8/8/K${i}k w - - 0 1` }))

  it('shows the universal text, not the original, to a reader of the comment\'s own language', async () => {
    useSettingsStore.setState({ commentDbUrl: 'https://example.org/db' })
    serve(universalShard({ en: 'Black grabs the pawn.' }))
    expect((await humanCommentsForGame(plies, 'en'))[10].text).toBe('Black grabs the pawn.')
  })

  it('a reader of another language without a translation gets the universal text, not the original', async () => {
    useSettingsStore.setState({ commentDbUrl: 'https://example.org/db' })
    serve(universalShard({ en: 'Black grabs the pawn.' }))
    expect((await humanCommentsForGame(plies, 'de'))[10].text).toBe('Black grabs the pawn.')
  })

  it('a comment dropped as not universal (empty universal text) is never borrowed nor listed', async () => {
    useSettingsStore.setState({ commentDbUrl: 'https://example.org/db' })
    serve(universalShard({ en: '' }))
    expect(await humanCommentsForGame(plies, 'en')).toEqual({})
    clearCommentCache()
    expect(await lookupPositionComments(FEN)).toEqual([])
  })
})

describe('comment source priority', () => {
  const serve = () => vi.stubGlobal('fetch', vi.fn(async (url: string) => new Response(JSON.stringify(url.endsWith('index.json') ? INDEX : SHARD), { status: 200 })))
  const plies = Array.from({ length: 12 }, (_, i) => ({ fenAfter: i === 9 ? FEN : `8/8/8/8/8/8/8/K${i}k w - - 0 1` }))
  // SHARD: a Spanish book remark and an English Lichess one.

  it('books: the book remark wins even when the reader\'s language is that of the study', async () => {
    useSettingsStore.setState({ commentDbUrl: 'https://example.org/db' })
    serve()
    expect((await humanCommentsForGame(plies, 'en', 15, { priority: 'books' }))[10].text).toBe('El caballo defiende el peón de e5.')
  })

  it('books: Lichess is used where no book remark exists', async () => {
    useSettingsStore.setState({ commentDbUrl: 'https://example.org/db' })
    vi.stubGlobal('fetch', vi.fn(async (url: string) => new Response(JSON.stringify(url.endsWith('index.json') ? INDEX : { [HASH]: [SHARD[HASH][0]] }), { status: 200 })))
    expect((await humanCommentsForGame(plies, 'es', 15, { priority: 'books' }))[10].text).toBe('A study remark.')
  })

  it('lichess: the study remark wins, even over a book remark in the reader\'s language', async () => {
    useSettingsStore.setState({ commentDbUrl: 'https://example.org/db' })
    serve()
    expect((await humanCommentsForGame(plies, 'es', 15, { priority: 'lichess' }))[10].text).toBe('A study remark.')
  })

  it('both: the remark in the reader\'s language first (previous behaviour)', async () => {
    useSettingsStore.setState({ commentDbUrl: 'https://example.org/db' })
    serve()
    expect((await humanCommentsForGame(plies, 'en', 15, { priority: 'both' }))[10].text).toBe('A study remark.')
  })

  it('defaults to the setting of the store (books)', async () => {
    useSettingsStore.setState({ commentDbUrl: 'https://example.org/db' })
    serve()
    expect((await humanCommentsForGame(plies, 'en'))[10].text).toBe('El caballo defiende el peón de e5.')
  })

  it('the Database-tab lookup stays unfiltered: every remark, books first', async () => {
    useSettingsStore.setState({ commentDbUrl: 'https://example.org/db', commentSourcePriority: 'lichess' })
    serve()
    expect((await lookupPositionComments(FEN)).map((c) => c.source.kind)).toEqual(['book', 'lichess'])
  })
})

describe('translating missing comments while borrowing', () => {
  const plies = Array.from({ length: 12 }, (_, i) => ({ fenAfter: i === 9 ? FEN : `8/8/8/8/8/8/8/K${i}k w - - 0 1` }))
  const serve = (entries: unknown[]) => vi.stubGlobal('fetch', vi.fn(async (url: string) => new Response(JSON.stringify(url.endsWith('index.json') ? INDEX : { [HASH]: entries }), { status: 200 })))
  const en = { id: 2, text: 'A study remark.', lang: 'en', game: '18-1', ply: 4, san: 'Nc6', source: 18, label: 'A – B' }

  it('uses the translation of the comment in the game right away', async () => {
    useSettingsStore.setState({ commentDbUrl: 'https://example.org/db' })
    serve([en])
    const translate = vi.fn(async () => 'Eine Studienbemerkung.')
    const human = await humanCommentsForGame(plies, 'de', 15, { priority: 'books', translate })
    expect(human[10].text).toBe('Eine Studienbemerkung.')
    expect(translate).toHaveBeenCalledTimes(1)
    expect(translate.mock.calls[0]).toEqual([expect.objectContaining({ id: 2, text: 'A study remark.', fen: FEN }), 'de'])
  })

  it('does not ask when the comment already has a text in the reader\'s language', async () => {
    useSettingsStore.setState({ commentDbUrl: 'https://example.org/db' })
    serve([{ ...en, translations: { en: 'Std.', de: 'Schon da.' } }])
    const translate = vi.fn(async () => 'x')
    expect((await humanCommentsForGame(plies, 'de', 15, { priority: 'books', translate }))[10].text).toBe('Schon da.')
    expect(translate).not.toHaveBeenCalled()
  })

  it('asks to standardise a comment in the reader\'s own language that has no universal text yet', async () => {
    useSettingsStore.setState({ commentDbUrl: 'https://example.org/db' })
    serve([en])
    const translate = vi.fn(async () => 'Black attacks.')
    expect((await humanCommentsForGame(plies, 'en', 15, { priority: 'books', translate }))[10].text).toBe('Black attacks.')
  })

  it('falls back to the untranslated text when the translation fails or throws', async () => {
    useSettingsStore.setState({ commentDbUrl: 'https://example.org/db' })
    serve([en])
    expect((await humanCommentsForGame(plies, 'de', 15, { priority: 'books', translate: async () => null }))[10].text).toBe('A study remark.')
    clearCommentCache()
    expect((await humanCommentsForGame(plies, 'de', 15, { priority: 'books', translate: async () => { throw new Error('boom') } }))[10].text).toBe('A study remark.')
  })
})

describe('normalized comments first', () => {
  const plies = Array.from({ length: 12 }, (_, i) => ({ fenAfter: i === 9 ? FEN : `8/8/8/8/8/8/8/K${i}k w - - 0 1` }))
  const serve = (entries: unknown[]) => vi.stubGlobal('fetch', vi.fn(async (url: string) => new Response(JSON.stringify(url.endsWith('index.json') ? INDEX : { [HASH]: entries }), { status: 200 })))
  const base = { game: '3-7', ply: 4, san: 'Nc6', source: 3, label: 'P7' }

  it('a normalized comment beats a raw one in the reader\'s language', async () => {
    useSettingsStore.setState({ commentDbUrl: 'https://example.org/db' })
    serve([{ ...base, id: 1, text: 'Raw es.', lang: 'es' }, { ...base, id: 2, text: 'Raw en.', lang: 'en', translations: { en: 'Normalized en.' } }])
    expect((await humanCommentsForGame(plies, 'es'))[10].text).toBe('Normalized en.')
  })

  it('among normalized ones the reader\'s language still wins', async () => {
    useSettingsStore.setState({ commentDbUrl: 'https://example.org/db' })
    serve([{ ...base, id: 1, text: 'Raw en.', lang: 'en', translations: { en: 'Norm en.' } }, { ...base, id: 2, text: 'Raw es.', lang: 'es', translations: { es: 'Norm es.' } }])
    expect((await humanCommentsForGame(plies, 'es'))[10].text).toBe('Norm es.')
  })

  it('stays inside the chosen priority group, and dropped comments stay out', async () => {
    useSettingsStore.setState({ commentDbUrl: 'https://example.org/db' })
    serve([{ ...base, id: 1, text: 'Raw book.', lang: 'es' }, { ...base, id: 2, text: 'Lichess norm.', lang: 'en', source: 18, translations: { en: 'Lichess normalized.' } }, { ...base, id: 3, text: 'Dropped.', lang: 'es', translations: { es: '' } }])
    expect((await humanCommentsForGame(plies, 'es', 15, { priority: 'books' }))[10].text).toBe('Raw book.')
  })

  it('normalizes on the fly a chosen remark without a normalized text', async () => {
    useSettingsStore.setState({ commentDbUrl: 'https://example.org/db' })
    serve([{ ...base, id: 1, text: 'Raw es.', lang: 'es' }])
    const normalize = vi.fn(async () => 'Normalizado.')
    expect((await humanCommentsForGame(plies, 'es', 15, { normalize }))[10].text).toBe('Normalizado.')
    clearCommentCache()
    serve([{ ...base, id: 1, text: 'Raw es.', lang: 'es', translations: { es: 'Ya normalizado.' } }])
    expect((await humanCommentsForGame(plies, 'es', 15, { normalize }))[10].text).toBe('Ya normalizado.')
    expect(normalize).toHaveBeenCalledTimes(1)
  })

  it('a failing normalize keeps the raw text', async () => {
    useSettingsStore.setState({ commentDbUrl: 'https://example.org/db' })
    serve([{ ...base, id: 1, text: 'Raw es.', lang: 'es' }])
    expect((await humanCommentsForGame(plies, 'es', 15, { normalize: async () => { throw new Error('x') } }))[10].text).toBe('Raw es.')
  })
})
