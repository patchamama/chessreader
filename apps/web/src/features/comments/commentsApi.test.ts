import { beforeEach, describe, expect, it, vi } from 'vitest'

const session = vi.hoisted(() => ({ on: false }))
vi.mock('../../shared/api/serverSession', () => ({ hasServerSession: () => session.on }))
const http = vi.hoisted(() => vi.fn())
vi.mock('../../shared/api/httpClient', () => ({ httpClient: http }))
const files = vi.hoisted(() => new Map<string, unknown>())
vi.mock('../library/commentdb/commentLookup', () => ({
  getJson: vi.fn(async (path: string) => {
    if (!files.has(path)) throw new Error('404')
    return files.get(path)
  }),
}))

import { clearCommentListCache, loadCommentGame, loadCommentPage, loadCommentSources, moveLabel } from './commentsApi'

const sources = { 1: { kind: 'book', title: 'Invented Book', author: 'A. Writer', lang: 'es', priority: 1, book: 'invented-book' }, 2: { kind: 'lichess', title: 'Lichess studies', author: null, lang: 'en', priority: 2, book: null } }
const entry = (id: number, source: number, text: string, lang = 'en', chapter: number | null = null) => ({
  id, hash: '0123456789abcdef', fen: '8/8/8/8/8/8/8/K6k w - - 0 1', text, lang, ply: 24, move: 12, san: 'Nb6', game: `${source}-1`, source, label: 'W – B', white: 'W', black: 'B', chapter,
})

beforeEach(() => {
  session.on = false
  http.mockReset()
  files.clear()
  clearCommentListCache()
  files.set('comments-index/meta.json', { version: 1, total: 3, pages: 2, pageSize: 2, sources })
  files.set('comments-index/0.json', { page: 0, comments: [entry(1, 1, 'El caballo vuelve.', 'es', 3), entry(2, 2, 'A study remark.')] })
  files.set('comments-index/1.json', { page: 1, comments: [entry(3, 2, 'Another remark about 100% control.')] })
})

describe('the list of comments (S2)', () => {
  it('without a server: reads the index pages of the resources', async () => {
    const page = await loadCommentPage({}, 0, 50)
    expect(page.total).toBe(3)
    expect(page.comments.map((c) => c.id)).toEqual([1, 2, 3])
    expect(page.comments[0]).toEqual({
      id: 1, hash: '0123456789abcdef', fen: '8/8/8/8/8/8/8/K6k w - - 0 1', text: 'El caballo vuelve.', lang: 'es', ply: 24, move: 12, san: 'Nb6', gameId: '1-1', chapter: 3,
      source: { id: 1, title: 'Invented Book', author: 'A. Writer', kind: 'book', lang: 'es', book: 'invented-book' },
      game: { white: 'W', black: 'B', label: 'W – B' },
    })
  })

  it('without a server: pages and filters by text, source, language and kind', async () => {
    expect((await loadCommentPage({}, 1, 1)).comments.map((c) => c.id)).toEqual([2])
    expect((await loadCommentPage({ q: '100%' }, 0, 50)).comments.map((c) => c.id)).toEqual([3])
    expect((await loadCommentPage({ q: 'CABALLO' }, 0, 50)).comments.map((c) => c.id)).toEqual([1])
    expect((await loadCommentPage({ source: 2 }, 0, 50)).total).toBe(2)
    expect((await loadCommentPage({ lang: 'es' }, 0, 50)).comments.map((c) => c.id)).toEqual([1])
    expect((await loadCommentPage({ kind: 'lichess', q: 'another' }, 0, 50)).comments.map((c) => c.id)).toEqual([3])
  })

  it('without a server and no filter: reads only the pages it shows', async () => {
    const { getJson } = await import('../library/commentdb/commentLookup')
    vi.mocked(getJson).mockClear()
    await loadCommentPage({}, 0, 2)
    expect(vi.mocked(getJson).mock.calls.map(([p]) => p)).not.toContain('comments-index/1.json')
  })

  it('with a server: asks the API with the filters', async () => {
    session.on = true
    http.mockResolvedValue({ total: 1, offset: 0, limit: 50, comments: [{ id: 9, hash: 'ab', fen: 'f', text: 't', lang: 'en', ply: 3, move_number: 2, san: 'e5', game_id: '2-1', chapter: null, source: { id: 2, title: 'Lichess studies', author: null, kind: 'lichess', lang: 'en', book: null }, game: { white: 'X', black: 'Y', label: null } }] })
    const page = await loadCommentPage({ q: 'a b', source: 2, lang: 'en', kind: 'lichess' }, 50, 50)
    expect(http).toHaveBeenCalledWith('/api/comments?offset=50&limit=50&q=a+b&source=2&lang=en&kind=lichess', { method: 'GET' })
    expect(page.comments[0]).toMatchObject({ id: 9, move: 2, gameId: '2-1', chapter: null })
  })

  it('with a server: keeps the translations a comment already has', async () => {
    session.on = true
    http.mockResolvedValue({ total: 1, offset: 0, limit: 50, comments: [{ id: 9, hash: 'ab', fen: 'f', text: 't', lang: 'en', ply: 3, move_number: 2, san: 'e5', game_id: '2-1', chapter: null, translations: { es: 'tt' }, source: { id: 2, title: 'L', author: null, kind: 'lichess', lang: 'en', book: null }, game: { white: 'X', black: 'Y', label: null } }] })
    expect((await loadCommentPage({}, 0, 50)).comments[0].translations).toEqual({ es: 'tt' })
  })

  it('sources: from the API with a server, from meta.json without', async () => {
    expect((await loadCommentSources()).map((s) => s.title)).toEqual(['Invented Book', 'Lichess studies'])
    session.on = true
    http.mockResolvedValue({ sources: [{ id: 1, title: 'Invented Book', author: null, kind: 'book', lang: 'es', book: null, comments: 4 }] })
    expect(await loadCommentSources()).toEqual([{ id: 1, title: 'Invented Book', author: null, kind: 'book', lang: 'es', book: null, comments: 4 }])
  })

  it('the game of a comment: g/<id>.json without a server, the API with one', async () => {
    files.set('g/1-1.json', { id: '1-1', source: 1, white: 'W', black: 'B', pgn: '1. e4 e5 *' })
    expect(await loadCommentGame('1-1')).toEqual({ id: '1-1', white: 'W', black: 'B', pgn: '1. e4 e5 *' })
    session.on = true
    http.mockResolvedValue({ id: '1-1', white: 'W', black: 'B', label: null, pgn: '1. d4 *' })
    expect((await loadCommentGame('1-1')).pgn).toBe('1. d4 *')
    expect(http).toHaveBeenCalledWith('/api/comments/games/1-1', { method: 'GET' })
  })

  it('moveLabel: white moves on odd plies, black with an ellipsis', () => {
    expect(moveLabel({ ply: 24, move: 12, san: 'Nb6' })).toBe('12...Nb6')
    expect(moveLabel({ ply: 15, move: 8, san: 'Nc3' })).toBe('8. Nc3')
  })
})
