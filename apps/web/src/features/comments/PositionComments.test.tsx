import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import PositionComments from './PositionComments'
import { useSettingsStore } from '../../shared/settings/settingsStore'
import { lookupPositionComments, type HumanComment } from '../library/commentdb/commentLookup'

vi.mock('../library/commentdb/commentLookup', async (orig) => ({
  ...(await orig<typeof import('../library/commentdb/commentLookup')>()),
  lookupPositionComments: vi.fn(async () => []),
}))
vi.mock('../database/CommentDetailsModal', () => ({
  default: ({ comment, onClose }: { comment: { text: string }; onClose: () => void }) => (
    <div role="dialog" aria-label="editor">{comment.text}<button onClick={onClose}>close-editor</button></div>
  ),
}))

const FEN = 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1'
const mk = (id: number, text: string, lang: string, translations?: Record<string, string>): HumanComment => ({
  id, text, lang, ply: 1, san: 'e4', gameId: 'g', label: null, source: { kind: 'book', title: 'Book', author: null }, translations,
})

beforeEach(() => {
  useSettingsStore.setState({ language: 'es', notationStyle: 'letters' })
  vi.mocked(lookupPositionComments).mockReset()
})

describe('PositionComments', () => {
  it('shows the comments in the board language, counted', async () => {
    vi.mocked(lookupPositionComments).mockResolvedValue([mk(1, 'Texto uno', 'es'), mk(2, 'English two', 'en', { es: 'Traducido dos' }), mk(3, 'Only English', 'en')])
    render(<PositionComments fen={FEN} />)
    expect(await screen.findByText('Texto uno')).toBeInTheDocument()
    expect(screen.getByText('Traducido dos')).toBeInTheDocument()
    expect(screen.queryByText('Only English')).toBeNull()
    expect(screen.getByText('2 comentarios para esta posición')).toBeInTheDocument()
  })

  it('falls back to English when none exists in the language', async () => {
    vi.mocked(lookupPositionComments).mockResolvedValue([mk(1, 'Only English', 'en'), mk(2, 'Nur Deutsch', 'de')])
    render(<PositionComments fen={FEN} />)
    expect(await screen.findByText('Only English')).toBeInTheDocument()
    expect(screen.queryByText('Nur Deutsch')).toBeNull()
    expect(screen.getByText('1 comentario para esta posición')).toBeInTheDocument()
  })

  it('shows nothing when there is no comment in either language', async () => {
    vi.mocked(lookupPositionComments).mockResolvedValue([mk(1, 'Nur Deutsch', 'de')])
    const { container } = render(<PositionComments fen={FEN} />)
    await vi.waitFor(() => expect(lookupPositionComments).toHaveBeenCalled())
    expect(container).toBeEmptyDOMElement()
  })

  it('opens the comment editor from Edit', async () => {
    useSettingsStore.setState({ language: 'en' })
    vi.mocked(lookupPositionComments).mockResolvedValue([mk(1, 'Edit me', 'en')])
    render(<PositionComments fen={FEN} />)
    fireEvent.click(await screen.findByRole('button', { name: 'Edit' }))
    expect(screen.getByRole('dialog', { name: 'editor' })).toHaveTextContent('Edit me')
    fireEvent.click(screen.getByText('close-editor'))
    expect(screen.queryByRole('dialog', { name: 'editor' })).toBeNull()
  })

  it('follows the position', async () => {
    useSettingsStore.setState({ language: 'en' })
    vi.mocked(lookupPositionComments).mockImplementation(async (f) => (f === FEN ? [mk(1, 'Here', 'en')] : []))
    const { rerender, container } = render(<PositionComments fen={FEN} />)
    expect(await screen.findByText('Here')).toBeInTheDocument()
    rerender(<PositionComments fen="8/8/8/8/8/8/8/K6k w - - 0 1" />)
    await vi.waitFor(() => expect(container).toBeEmptyDOMElement())
  })
})
