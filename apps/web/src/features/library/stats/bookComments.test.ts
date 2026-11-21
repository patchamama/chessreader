import { describe, it, expect, vi, beforeEach } from 'vitest'

const loadCommentSources = vi.fn()
const loadCommentPage = vi.fn()
vi.mock('../../comments/commentsApi', () => ({
  loadCommentSources: () => loadCommentSources(),
  loadCommentPage: (...a: unknown[]) => loadCommentPage(...a),
}))
vi.mock('../../../shared/api/serverSession', () => ({ hasServerSession: () => false }))

import { bookCommentCount } from './bookStats'

const src = (id: number, title: string, extra: object = {}) => ({ id, title, author: null, kind: 'book', lang: 'es', book: null, ...extra })
beforeEach(() => vi.clearAllMocks())

describe('bookCommentCount: the comments of the database that come from a book', () => {
  it('counts the comments of the source whose short title starts the library title', async () => {
    loadCommentSources.mockResolvedValue([src(1, 'Mis geniales predecesores I', { comments: 1200 }), src(2, 'Mis geniales predecesores II', { comments: 900 }), src(3, 'Other', { comments: 9 })])
    expect(await bookCommentCount(5, 'Mis geniales predecesores I. De Steinitz a Alekhine')).toBe(1200)
    expect(await bookCommentCount(6, 'Mis geniales predecesores II. De Euwe A Tal')).toBe(900)
  })

  it('counts through the list when a source has no precomputed count', async () => {
    loadCommentSources.mockResolvedValue([src(7, 'My Book')])
    loadCommentPage.mockResolvedValue({ total: 42, comments: [] })
    expect(await bookCommentCount(5, 'My Book')).toBe(42)
    expect(loadCommentPage).toHaveBeenCalledWith({ source: 7 }, 0, 1)
  })

  it('also matches by the book id the source records', async () => {
    loadCommentSources.mockResolvedValue([src(7, 'Another title', { book: '5', comments: 11 })])
    expect(await bookCommentCount(5, 'My Book')).toBe(11)
  })

  it('is 0 when the database knows nothing of the book, or cannot be read', async () => {
    loadCommentSources.mockResolvedValue([src(1, 'Other', { comments: 9 })])
    expect(await bookCommentCount(5, 'My Book')).toBe(0)
    loadCommentSources.mockRejectedValue(new Error('x'))
    expect(await bookCommentCount(5, 'My Book')).toBe(0)
  })
})
