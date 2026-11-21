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
  it('sums the comments of the sources named like the book', async () => {
    loadCommentSources.mockResolvedValue([src(1, 'Mis geniales predecesores I. De Steinitz a Alekhine', { comments: 1200 }), src(2, 'Other', { comments: 9 }), src(3, 'mis geniales predecesores i. de steinitz a alekhine', { comments: 3 })])
    expect(await bookCommentCount(5, 'Mis geniales predecesores I. De Steinitz a Alekhine')).toBe(1203)
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
