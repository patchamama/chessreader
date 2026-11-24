import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import GeneratedPgnTab from './GeneratedPgnTab'
import type { GeneratedPgnClient, GeneratedPgnItem, GeneratedPgnSummary } from './generatedPgnApi'

vi.mock('../../shared/chess/ChessBoard', () => ({ default: ({ fen }: { fen: string }) => <div data-testid="board">{fen}</div> }))

const PGN = '[White "Alpha"]\n[Black "Beta"]\n\n1. e4 {Invented.} e5 2. Nf3 1-0\n'
const row = (id: number, o: Partial<GeneratedPgnSummary> = {}): GeneratedPgnSummary => ({
  id, bookId: 7, bookTitle: 'Invented Endings', chapter: 1, gameIndex: id - 1, white: `W${id}`, black: `B${id}`, event: 'E', result: '1-0', status: 'new',
  createdBy: 1, createdAt: '2025-01-01T00:00:00Z', updatedAt: '2025-01-01T00:00:00Z', lichessUrl: null, canWrite: true, ...o,
})

function fake(rows: GeneratedPgnSummary[], over: Partial<GeneratedPgnClient> = {}): GeneratedPgnClient {
  return {
    list: vi.fn(async (q = {}) => ({
      items: rows.filter((r) => (!q.status || r.status === q.status) && (!q.bookId || r.bookId === q.bookId)),
      books: [{ bookId: 7, bookTitle: 'Invented Endings', count: 2 }, { bookId: 9, bookTitle: 'Other Book', count: 1 }],
    })),
    get: vi.fn(async (id: number) => ({ ...rows.find((r) => r.id === id)!, pgn: PGN }) as GeneratedPgnItem),
    create: vi.fn(),
    update: vi.fn(async (id: number, p) => ({ ...rows.find((r) => r.id === id)!, pgn: PGN, ...p }) as GeneratedPgnItem),
    remove: vi.fn(async () => undefined),
    uploadToLichess: vi.fn(async () => ({ url: 'https://lichess.org/study/AbCdEfGh', chapters: [{ id: 'c1', name: 'Game' }], visibility: 'private' as const, visibilityApplied: false, note: 'Set the visibility in Lichess.' })),
    ...over,
  }
}
beforeEach(() => { vi.spyOn(window, 'confirm').mockReturnValue(true) })
afterEach(() => { cleanup(); vi.restoreAllMocks() })

describe('GeneratedPgnTab', () => {
  it('lists the games and filters them by book and status through the server', async () => {
    const client = fake([row(1), row(2, { status: 'reviewed' }), row(3, { bookId: 9, bookTitle: 'Other Book' })])
    render(<GeneratedPgnTab client={client} />)
    expect(await screen.findAllByRole('row')).toHaveLength(4)
    fireEvent.change(screen.getByLabelText('Filter by status'), { target: { value: 'reviewed' } })
    await waitFor(() => expect(screen.getAllByRole('row')).toHaveLength(2))
    expect(client.list).toHaveBeenLastCalledWith({ status: 'reviewed' })
    fireEvent.change(screen.getByLabelText('Filter by status'), { target: { value: '' } })
    fireEvent.change(screen.getByLabelText('Filter by book'), { target: { value: '9' } })
    await waitFor(() => expect(client.list).toHaveBeenLastCalledWith({ bookId: 9 }))
  })

  it('shows an empty state and a server error', async () => {
    render(<GeneratedPgnTab client={fake([])} />)
    expect(await screen.findByText('No generated PGN yet.')).toBeInTheDocument()
    cleanup()
    render(<GeneratedPgnTab client={fake([], { list: vi.fn().mockRejectedValue(new Error('boom')) })} />)
    expect(await screen.findByRole('alert')).toHaveTextContent('boom')
  })

  it('opens a game on the board, steps through its moves, and accepts, rejects and edits it', async () => {
    const client = fake([row(1)])
    render(<GeneratedPgnTab client={client} />)
    fireEvent.click(await screen.findByRole('button', { name: /Open W1 - B1/ }))
    const detail = await screen.findByLabelText('Generated game')
    expect(within(detail).getByTestId('board')).toHaveTextContent('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq')
    fireEvent.click(within(detail).getByLabelText('Next move'))
    expect(within(detail).getByTestId('board')).toHaveTextContent('4P3')
    fireEvent.click(within(detail).getByLabelText('Last position'))
    expect(within(detail).getByText(/3\/3 Nf3/)).toBeInTheDocument()

    fireEvent.click(within(detail).getByRole('button', { name: 'Accept' }))
    await waitFor(() => expect(client.update).toHaveBeenCalledWith(1, { status: 'reviewed' }))
    expect(await within(detail).findByText('Reviewed')).toBeInTheDocument()

    fireEvent.click(within(detail).getByRole('button', { name: 'Reject' }))
    await waitFor(() => expect(client.update).toHaveBeenCalledWith(1, { status: 'rejected' }))

    fireEvent.change(within(detail).getByLabelText('PGN'), { target: { value: '1. d4 d5 *' } })
    fireEvent.click(within(detail).getByRole('button', { name: 'Save changes' }))
    await waitFor(() => expect(client.update).toHaveBeenCalledWith(1, { pgn: '1. d4 d5 *' }))
  })

  it('says when the PGN cannot be played, and shows a read-only view to who cannot write', async () => {
    const client = fake([row(1, { canWrite: false })], { get: vi.fn(async () => ({ ...row(1, { canWrite: false }), pgn: '1. e5 e5 *' })) })
    render(<GeneratedPgnTab client={client} />)
    fireEvent.click(await screen.findByRole('button', { name: /Open W1/ }))
    const detail = await screen.findByLabelText('Generated game')
    expect(within(detail).getByText(/cannot be played/)).toBeInTheDocument()
    expect(within(detail).queryByRole('button', { name: 'Accept' })).toBeNull()
    expect(within(detail).queryByLabelText('Lichess study link or id')).toBeNull()
    expect(within(detail).getByLabelText('PGN')).toHaveAttribute('readonly')
  })

  it('deletes after confirming and reloads the list', async () => {
    const client = fake([row(1)])
    render(<GeneratedPgnTab client={client} />)
    fireEvent.click(await screen.findByRole('button', { name: /Open W1/ }))
    fireEvent.click(await screen.findByRole('button', { name: 'Delete' }))
    await waitFor(() => expect(client.remove).toHaveBeenCalledWith(1))
    await waitFor(() => expect(screen.queryByLabelText('Generated game')).toBeNull())
  })

  it('adds the PGN to an existing study with a per-request token and says the visibility is not applied', async () => {
    const client = fake([row(1)])
    render(<GeneratedPgnTab client={client} />)
    fireEvent.click(await screen.findByRole('button', { name: /Open W1/ }))
    const panel = await screen.findByLabelText('Lichess')
    expect(panel).toHaveTextContent(/cannot create a study or\s+change whether it is private or public/)
    const send = within(panel).getByRole('button', { name: 'Add to the study' })
    expect(send).toBeDisabled()
    fireEvent.change(within(panel).getByLabelText('Lichess study link or id'), { target: { value: 'https://lichess.org/study/AbCdEfGh' } })
    fireEvent.change(within(panel).getByLabelText('Intended visibility'), { target: { value: 'public' } })
    fireEvent.change(within(panel).getByLabelText('Lichess token with study:write'), { target: { value: 'lip_' + 'x'.repeat(20) } })
    fireEvent.click(send)
    await waitFor(() => expect(client.uploadToLichess).toHaveBeenCalledWith(1, { studyId: 'https://lichess.org/study/AbCdEfGh', visibility: 'public', token: 'lip_' + 'x'.repeat(20) }))
    expect(await within(panel).findByText(/Set the visibility in Lichess/)).toBeInTheDocument()
    // the token is cleared after the call and never kept
    expect(within(panel).getByLabelText('Lichess token with study:write')).toHaveValue('')
    expect(localStorage.length).toBe(0)
    expect(JSON.stringify(sessionStorage)).not.toContain('lip_')
  })
})
