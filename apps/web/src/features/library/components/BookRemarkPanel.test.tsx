import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import BookRemarkPanel from './BookRemarkPanel'
import type { HumanComment } from '../commentdb/commentLookup'

const comments: HumanComment[] = []
vi.mock('../../comments/usePositionComments', () => ({ usePositionComments: () => comments }))
vi.mock('../../database/CommentDetailsModal', () => ({ default: ({ comment }: { comment: { id: number } }) => <div data-testid="details">details {comment.id}</div> }))

const base = { lang: 'es', ply: 4, san: 'Nf3', gameId: 'g', label: null, source: { kind: 'book', title: 'Libro', author: 'A. Autor' } }
const FEN = 'rnbqkbnr/pppppppp/8/8/8/5N2/PPPPPPPP/RNBQKB1R b KQkq - 1 1'

beforeEach(() => {
  comments.length = 0
  comments.push(
    { ...base, id: 1, text: 'texto original uno', translations: { es: 'texto normalizado uno', en: 'normalised one' } },
    { ...base, id: 2, text: 'texto original dos' },
  )
})

describe('BookRemarkPanel', () => {
  it('lists every remark of the position and says which are normalized', () => {
    render(<BookRemarkPanel fen={FEN} lang="es" onUse={vi.fn()} onClose={vi.fn()} />)
    expect(screen.getByText('texto normalizado uno')).toBeInTheDocument()
    expect(screen.getAllByText('normalized')).toHaveLength(1)
    expect(screen.getByText('not normalized')).toBeInTheDocument()
  })

  it('uses the normalized text, or the original one, in the book', () => {
    const onUse = vi.fn()
    render(<BookRemarkPanel fen={FEN} lang="es" onUse={onUse} onClose={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: 'Use the normalized text of comment 1' }))
    expect(onUse).toHaveBeenLastCalledWith(expect.objectContaining({ text: 'texto normalizado uno', source: 'Autor, Libro' }))
    fireEvent.click(screen.getByRole('button', { name: 'Use the original text of comment 1' }))
    expect(onUse).toHaveBeenLastCalledWith(expect.objectContaining({ text: 'texto original uno' }))
  })

  it('has no normalized option for a remark without one', () => {
    render(<BookRemarkPanel fen={FEN} lang="es" onUse={vi.fn()} onClose={vi.fn()} />)
    expect(screen.queryByRole('button', { name: 'Use the normalized text of comment 2' })).toBeNull()
    expect(screen.getByRole('button', { name: 'Use the original text of comment 2' })).toBeInTheDocument()
  })

  it('opens the editor of a comment', () => {
    render(<BookRemarkPanel fen={FEN} lang="es" onUse={vi.fn()} onClose={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: 'Edit comment 2' }))
    expect(screen.getByTestId('details')).toHaveTextContent('details 2')
  })
})
