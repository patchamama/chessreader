import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { positionHash } from '@chess-ebook/chess-shared'
import { clearCommentCache, humanCommentsForGame, lookupPositionComments } from './commentLookup'
import { useSettingsStore } from '../../../shared/settings/settingsStore'
import { useAuthStore } from '../../auth/store/authStore'

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
