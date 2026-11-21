import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import CommentCard from './CommentCard'
import type { HumanComment } from '../library/commentdb/commentLookup'

vi.mock('../comments/commentsApi', async (orig) => ({ ...(await orig<object>()), loadCommentGame: vi.fn() }))

const comment: HumanComment = {
  id: 5, text: 'A classic, see https://example.org/page.', lang: 'en', ply: 4, san: 'Nf3', gameId: 'g1', label: 'Round 3',
  source: { kind: 'book', title: 'Some Book', author: 'A. Author' },
}
const fen = 'rnbqkbnr/pppppppp/8/8/8/5N2/PPPPPPPP/RNBQKB1R b KQkq - 1 1'

describe('CommentCard', () => {
  it('links the urls of the comment in another window', () => {
    render(<MemoryRouter><CommentCard comment={comment} fen={fen} /></MemoryRouter>)
    const a = screen.getByRole('link', { name: 'https://example.org/page' })
    expect(a).toHaveAttribute('target', '_blank')
  })

  it('offers the game the comment comes from', () => {
    render(<MemoryRouter><CommentCard comment={comment} fen={fen} /></MemoryRouter>)
    expect(screen.getByRole('button', { name: 'Open the game' })).toBeInTheDocument()
  })

  it('works outside a router, without the game button', () => {
    render(<CommentCard comment={comment} fen={fen} />)
    expect(screen.queryByRole('button', { name: 'Open the game' })).toBeNull()
  })
})
