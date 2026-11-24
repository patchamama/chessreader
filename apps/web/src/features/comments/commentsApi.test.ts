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

import { saveBookGame, setCommentActions, clearCommentListCache, deleteComment, loadTopPositions, hideComment, restoreComment, loadCommentGame, loadCommentPage, loadCommentSources, moveLabel } from './commentsApi'

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

describe('deleting a comment (S17)', () => {
  it('sends DELETE and forgets the cached list pages', async () => {
    await loadCommentPage({}, 0, 50) // caches the pages
    http.mockResolvedValue({ deleted: 2 })
    await deleteComment(2)
    expect(http).toHaveBeenCalledWith('/api/comments/2', { method: 'DELETE' })
    files.set('comments-index/meta.json', { version: 1, total: 1, pages: 1, pageSize: 2, sources })
    files.set('comments-index/0.json', { page: 0, comments: [entry(1, 1, 'El caballo vuelve.', 'es', 3)] })
    expect((await loadCommentPage({}, 0, 50)).total).toBe(1)
  })

  it('lets a server refusal reach the caller and keeps the cache', async () => {
    http.mockRejectedValue(new Error('read-only'))
    await expect(deleteComment(2)).rejects.toThrow('read-only')
  })
})

describe('hiding and restoring a comment (S21)', () => {
  it('hideComment sends DELETE, restoreComment sends POST, both forget the cached pages', async () => {
    await loadCommentPage({}, 0, 50)
    http.mockResolvedValue({ hidden: 2 })
    await hideComment(2)
    expect(http).toHaveBeenCalledWith('/api/comments/2', { method: 'DELETE' })
    files.set('comments-index/meta.json', { version: 1, total: 1, pages: 1, pageSize: 2, sources })
    files.set('comments-index/0.json', { page: 0, comments: [entry(1, 1, 'El caballo vuelve.', 'es', 3)] })
    expect((await loadCommentPage({}, 0, 50)).total).toBe(1)
    http.mockResolvedValue({ restored: 2 })
    await restoreComment(2)
    expect(http).toHaveBeenLastCalledWith('/api/comments/2/restore', { method: 'POST' })
  })

  it('deleteComment is the deprecated alias of hideComment', () => {
    expect(deleteComment).toBe(hideComment)
  })

  it('sends hidden=1 to the server only when asked, and maps hidden_at to hiddenAt', async () => {
    session.on = true
    const row = { id: 2, hash: 'h', fen: 'f', text: 't', lang: 'en', ply: 1, move_number: 1, san: 'e4', game_id: 'g', chapter: null, hidden_at: '2026-11-21 10:00:00', source: { id: 1, title: 'x', author: null, kind: 'book', lang: 'en', book: null }, game: { white: null, black: null, label: null } }
    http.mockResolvedValue({ total: 1, comments: [row] })
    const page = await loadCommentPage({ hidden: true }, 0, 50)
    expect(http.mock.calls[0][0]).toContain('hidden=1')
    expect(page.comments[0].hiddenAt).toBe('2026-11-21 10:00:00')
    await loadCommentPage({}, 0, 50)
    expect(http.mock.calls[1][0]).not.toContain('hidden')
  })
})

describe('the most commented positions (S23)', () => {
  const A = '8/8/8/8/8/8/8/K6k w - - 0 1'
  const B = '8/8/8/8/8/8/8/K5k1 w - - 0 1'
  const at = (id: number, source: number, fen: string, hash: string, text: string, lang = 'en') => ({ ...entry(id, source, text, lang), fen, hash })
  beforeEach(() => {
    files.set('comments-index/meta.json', { version: 1, total: 5, pages: 2, pageSize: 3, sources })
    files.set('comments-index/0.json', { page: 0, comments: [at(1, 1, A, 'bb', 'one', 'es'), at(2, 2, A, 'bb', 'two'), at(3, 2, B, 'aa', 'x'.repeat(300))] })
    files.set('comments-index/1.json', { page: 1, comments: [at(4, 2, A, 'bb', 'four'), at(5, 1, B, 'aa', 'five', 'es')] })
  })

  it('without a server: groups the index by position, ranks by count then hash, with sources and samples', async () => {
    const top = await loadTopPositions()
    expect(top.map((p) => [p.rank, p.fen, p.count])).toEqual([[1, `${A.replace(' 0 1', '')} 0 1`, 3], [2, `${B.replace(' 0 1', '')} 0 1`, 2]])
    expect(top[0].sources.map((s) => [s.id, s.count])).toEqual([[2, 2], [1, 1]])
    expect(top[0].sources[0]).toEqual({ id: 2, title: 'Lichess studies', author: null, book: null, kind: 'lichess', lang: 'en', count: 2 })
    expect(top[0].samples.map((s) => s.id)).toEqual([1, 2, 4])
    expect(top[1].samples.find((s) => s.id === 3)?.text).toHaveLength(240)
    expect(await loadTopPositions({}, 1)).toHaveLength(1)
  })

  it('honours the filter and aggregates once per filter', async () => {
    expect((await loadTopPositions({ lang: 'es' })).map((p) => p.count)).toEqual([1, 1])
    expect((await loadTopPositions({ source: 2 }))[0].count).toBe(2)
    expect((await loadTopPositions({ q: 'five' })).map((p) => p.count)).toEqual([1])
    const { getJson } = await import('../library/commentdb/commentLookup')
    const calls = (getJson as unknown as { mock: { calls: unknown[] } }).mock.calls.length
    await loadTopPositions({ source: 2 })
    expect((getJson as unknown as { mock: { calls: unknown[] } }).mock.calls.length).toBe(calls)
  })

  it('with a server: asks /api/comments/top with the filter and the limit', async () => {
    session.on = true
    http.mockResolvedValue({ positions: [{ rank: 1, fen: A, count: 2, sources: [], samples: [] }] })
    const top = await loadTopPositions({ lang: 'es', kind: 'book', q: ' caballo ', hidden: true }, 20)
    expect(http.mock.calls[0][0]).toBe('/api/comments/top?limit=20&q=caballo&lang=es&kind=book')
    expect(top[0].count).toBe(2)
  })
})

describe('saveBookGame (a translated game goes to the database)', () => {
  const game = {
    book: { title: 'Invented Book', author: 'A. Writer', lang: 'en' }, chapter: 3,
    game: {
      label: 'Game 1', pgn: '1. e4 e5 *',
      comments: [{ hash: '0123456789abcdef', key: '8/8/8/8/8/8/8/K6k w - -', ply: 2, move: 1, san: 'e5', text: 'A solid reply.' }],
      translations: { es: { pgn: '1. e4 e5 *', comments: ['Una respuesta sólida.'] } },
    },
  }

  it('posts the book, its game, the comments and their translations in one request (admin)', async () => {
    http.mockResolvedValue({ gameId: 'b1', sourceId: 4, added: 1, translated: 1 })
    const r = await saveBookGame(game)
    expect(http).toHaveBeenCalledWith('/api/comments/book-games', { method: 'POST', body: JSON.stringify(game) })
    expect(r).toEqual({ gameId: 'b1', sourceId: 4, added: 1, translated: 1 })
  })

  it('refreshes the comment lists afterwards', async () => {
    http.mockResolvedValue({ gameId: 'b1', sourceId: 4, added: 0, translated: 0 })
    files.set('comments-index/meta.json', {})
    await saveBookGame(game)
    expect(http).toHaveBeenCalledTimes(1)
  })
})

describe('moveLabel of a comment printed before the first move', () => {
  it('reads "Start" instead of a move', () => {
    expect(moveLabel({ ply: 0, move: 0, san: '@intro' })).toBe('Start')
    expect(moveLabel({ ply: 2, move: 1, san: 'e5' })).toBe('1...e5')
  })
})

describe('narration actions of a comment (studies-epub-pgn-narration S6)', () => {
  it('setCommentActions PUTs them and forgets the cached pages', async () => {
    http.mockResolvedValue({ saved: 2 })
    await setCommentActions(2, '0Diagonal:c8-h3, 1Arrow:f7-f5')
    expect(http).toHaveBeenCalledWith('/api/comments/2/actions', { method: 'PUT', body: JSON.stringify({ actions: '0Diagonal:c8-h3, 1Arrow:f7-f5' }) })
  })

  it('a listed comment carries its actions from the server and from the static index', async () => {
    session.on = true
    http.mockResolvedValue({ total: 1, comments: [{ id: 2, hash: 'h', fen: 'f', text: 't', lang: 'es', ply: 2, move_number: 1, san: 'e5', game_id: 'g', chapter: null, actions: '0Clear', source: { id: 1, title: 'B', author: null, kind: 'book', lang: 'es', book: null }, game: { white: null, black: null, label: null } }] })
    expect((await loadCommentPage({}, 0, 10)).comments[0].actions).toBe('0Clear')
    session.on = false
    clearCommentListCache()
    files.set('comments-index/0.json', { page: 0, comments: [{ ...entry(1, 1, 'x', 'es'), actions: '1Piece:c8' }] })
    expect((await loadCommentPage({ q: 'x' }, 0, 10)).comments[0].actions).toBe('1Piece:c8')
  })
})
