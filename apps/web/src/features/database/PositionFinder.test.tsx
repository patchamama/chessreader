import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'

const lookup = vi.hoisted(() => vi.fn())
vi.mock('../library/commentdb/commentLookup', () => ({ lookupPositionComments: lookup }))

const loadTraps = vi.hoisted(() => vi.fn())
vi.mock('../training/traps', () => ({ loadTraps }))
const hideComment = vi.hoisted(() => vi.fn())
vi.mock('../comments/commentsApi', async (orig) => ({ ...(await orig<typeof import('../comments/commentsApi')>()), hideComment }))
vi.mock('../../shared/llm', () => ({ useLlm: () => ({ available: false, vision: false, config: null, complete: vi.fn() }) }))
vi.mock('../../shared/chess/ChessBoard', () => ({
  default: ({ fen, onPieceDrop, onSquareClick }: { fen: string; onPieceDrop?: (from: string, to: string) => boolean; onSquareClick?: (sq: string) => void }) => (
    <div data-testid="board" data-fen={fen}>
      {onSquareClick && <button onClick={() => onSquareClick('e2')}>click e2</button>}
      {onPieceDrop && <button onClick={() => onPieceDrop('e2', 'e4')}>drop e2e4</button>}
      {onPieceDrop && <button onClick={() => onPieceDrop('e7', 'e5')}>drop e7e5</button>}
    </div>
  ),
}))

import PositionFinder from './PositionFinder'

const AFTER_E4 = 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1'
const found = { text: 'The king pawn opens lines.', lang: 'en', ply: 1, san: 'e4', gameId: '1-1', label: null, source: { kind: 'book', title: 'Invented Book', author: 'A. Writer' }, translations: { es: 'El peón de rey abre líneas.' } }

beforeEach(() => {
  cleanup()
  lookup.mockReset()
  lookup.mockResolvedValue([found])
  loadTraps.mockReset()
  hideComment.mockReset()
  loadTraps.mockResolvedValue([{ id: 'classic-scholar', title: "Scholar's mate", opening: 'Italian Game', sans: ['e4', 'e5', 'Bc4', 'Nc6'] }])
})

const type = (text: string) => {
  fireEvent.change(screen.getByRole('textbox', { name: 'FEN or PGN' }), { target: { value: text } })
  fireEvent.click(screen.getByRole('button', { name: 'Find' }))
}

describe('Find by position (S2)', () => {
  it('shows the comments of a pasted FEN', async () => {
    render(<PositionFinder />)
    type(AFTER_E4)
    expect(await screen.findByText('The king pawn opens lines.')).toBeTruthy()
    expect(lookup).toHaveBeenCalledWith(AFTER_E4)
    expect(screen.getByText(/Invented Book/)).toBeTruthy()
    expect(screen.getByText('El peón de rey abre líneas.')).toBeTruthy()
  })

  it('lists the moves of a PGN and shows the comments of the selected move', async () => {
    render(<PositionFinder />)
    type('1. e4 e5 2. Nf3 *')
    const list = await screen.findByRole('list', { name: 'Moves' })
    expect(within(list).getAllByRole('button').map((b) => b.textContent)).toEqual(['1. e4', '1... e5', '2. Nf3'])
    expect(lookup).not.toHaveBeenCalled()
    fireEvent.click(within(list).getByRole('button', { name: '1. e4' }))
    await waitFor(() => expect(lookup).toHaveBeenCalledWith(AFTER_E4))
    expect(await screen.findByText('The king pawn opens lines.')).toBeTruthy()
  })

  it('says when the position has no comments', async () => {
    lookup.mockResolvedValue([])
    render(<PositionFinder />)
    type(AFTER_E4)
    expect(await screen.findByText('No comments for this position.')).toBeTruthy()
  })

  it('shows an error for invalid input and does not look anything up', async () => {
    render(<PositionFinder />)
    type('not chess')
    expect((await screen.findByRole('alert')).textContent).toMatch(/not a valid FEN or PGN/i)
    expect(lookup).not.toHaveBeenCalled()
  })
})

const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'

describe('Find by position: count, tolerant PGN, boards, edit and suggestions (S4, S6-S9)', () => {
  it('counts the comments found, also zero (S9)', async () => {
    render(<PositionFinder />)
    type(AFTER_E4)
    expect(await screen.findByText(/1 comment found for this position/)).toBeTruthy()
    cleanup()
    lookup.mockResolvedValue([])
    render(<PositionFinder />)
    type(AFTER_E4)
    expect(await screen.findByText(/0 comments found for this position/)).toBeTruthy()
  })

  it('applies the filters of the list and counts what they hide', async () => {
    lookup.mockResolvedValue([found, { ...found, text: 'A German remark.', lang: 'de' }])
    render(<PositionFinder filter={{ q: '', lang: 'de', kind: '' }} />)
    type(AFTER_E4)
    expect(await screen.findByText(/1 comment found for this position/)).toBeTruthy()
    expect(screen.getByText(/1 hidden by the filters/)).toBeTruthy()
    expect(screen.queryByText('The king pawn opens lines.')).toBeNull()
  })

  it('fixes a sloppy PGN and lists its moves (S7, S8)', async () => {
    render(<PositionFinder />)
    type('1 e4 e5 2 Cf3 CC6')
    const list = await screen.findByRole('list', { name: 'Moves' })
    expect(within(list).getAllByRole('button').map((b) => b.textContent)).toEqual(['1. e4', '1... e5', '2. Nf3', '2... Nc6'])
    expect(screen.getByText(/Read as:/).textContent).toContain('1. e4 e5 2. Cf3 Cc6 (ES)')
    expect((screen.getByRole('textbox', { name: 'FEN or PGN' }) as HTMLTextAreaElement).value).toBe('1. e4 e5 2. Cf3 Cc6')
  })

  it('names the unrecognised characters in an alert and still lists the moves read', async () => {
    render(<PositionFinder />)
    type('1. e4 e5 2. Nf3 N@c6')
    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toMatch(/"N@c6"/)
    expect(alert.textContent).toMatch(/@/)
    expect(within(screen.getByRole('list', { name: 'Moves' })).getAllByRole('button')).toHaveLength(3)
  })

  it('shows the help table with the frequent moves in three languages (S7)', () => {
    render(<PositionFinder />)
    const help = screen.getByText('Help: how moves are written').closest('details')!
    expect(within(help).getAllByText('O-O-O').length).toBe(3)
    expect(within(help).getByText('Nxe5')).toBeTruthy()
    expect(within(help).getByText('e8=Q')).toBeTruthy()
    expect(within(help).getAllByText('Dxf7#').length).toBe(2)
  })

  it('shows a recognised move on a board when asked (S7)', async () => {
    render(<PositionFinder />)
    type('1. e4 e5')
    await screen.findByRole('list', { name: 'Moves' })
    expect(screen.queryByTestId('move-board-0')).toBeNull()
    fireEvent.click(screen.getByRole('checkbox', { name: 'Show 1. e4 on a board' }))
    expect(within(screen.getByTestId('move-board-0')).getByTestId('board').getAttribute('data-fen')).toBe(AFTER_E4)
  })

  it('looks the comments up for each position reached on the board (S4)', async () => {
    render(<PositionFinder />)
    fireEvent.click(screen.getByRole('button', { name: 'Board' }))
    await waitFor(() => expect(lookup).toHaveBeenLastCalledWith(START_FEN))
    fireEvent.click(screen.getByRole('button', { name: 'drop e2e4' }))
    await waitFor(() => expect(lookup).toHaveBeenLastCalledWith(AFTER_E4))
    expect(await screen.findByText(/1 comment found for this position/)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Clear' }))
    await waitFor(() => expect(lookup).toHaveBeenLastCalledWith('8/8/8/8/8/8/8/8 w - - 0 1'))
    fireEvent.click(screen.getByRole('button', { name: 'Reset' }))
    await waitFor(() => expect(lookup).toHaveBeenLastCalledWith(START_FEN))
  })

  it('opens the details editor from a found comment (S6)', async () => {
    render(<PositionFinder />)
    type(AFTER_E4)
    fireEvent.click(await screen.findByRole('button', { name: /Edit comment/ }))
    const d = screen.getByRole('dialog', { name: /details/ })
    expect(within(d).getByText('The king pawn opens lines.')).toBeTruthy()
    expect(within(d).getByRole('button', { name: 'Save' })).toBeTruthy()
    fireEvent.click(within(d).getByRole('button', { name: 'Cancel' }))
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('loads a common opening on the board to replay it with its comments (S4)', async () => {
    render(<PositionFinder />)
    fireEvent.click(screen.getByRole('button', { name: 'Ruy Lopez' }))
    expect((screen.getByRole('textbox', { name: 'FEN or PGN' }) as HTMLTextAreaElement).value).toBe('1. e4 e5 2. Nf3 Nc6 3. Bb5')
    await waitFor(() => expect(lookup).toHaveBeenCalledWith(START_FEN))
    fireEvent.click(screen.getByRole('button', { name: 'Forward' }))
    await waitFor(() => expect(lookup).toHaveBeenLastCalledWith(AFTER_E4))
  })

  it('offers the traps as suggestions too (S4)', async () => {
    render(<PositionFinder />)
    fireEvent.click(screen.getByText('Suggestions: common openings and traps'))
    fireEvent.click(await screen.findByRole('button', { name: "Scholar's mate" }))
    expect((screen.getByRole('textbox', { name: 'FEN or PGN' }) as HTMLTextAreaElement).value).toBe('1. e4 e5 2. Bc4 Nc6')
    expect(screen.getByRole('button', { name: 'Forward' })).toBeTruthy()
  })
})

describe('Find by position: numbering, move counts, comment map, delete (S17-S21)', () => {
  const openBoard = () => { render(<PositionFinder />); fireEvent.click(screen.getByRole('button', { name: 'Board' })) }

  it('prints the played moves as numbered PGN (S18)', async () => {
    openBoard()
    fireEvent.click(screen.getByRole('button', { name: 'drop e2e4' }))
    fireEvent.click(screen.getByRole('button', { name: 'drop e7e5' }))
    await waitFor(() => expect(screen.getAllByText('1. e4 e5').length).toBeGreaterThan(0))
  })

  it('writes on the squares of a selected piece the comments each move would find (S19)', async () => {
    lookup.mockImplementation(async (fen: string) => (fen === AFTER_E4 ? [found] : []))
    openBoard()
    fireEvent.click(screen.getByRole('button', { name: 'click e2' }))
    expect((await screen.findByTestId('badge-e4')).textContent).toBe('1')
    expect(screen.getByTestId('badge-e3').textContent).toBe('0')
    expect(screen.queryByTestId('badge-d4')).toBeNull()
  })

  it('does not look the same position up twice when a piece is selected again', async () => {
    openBoard()
    fireEvent.click(screen.getByRole('button', { name: 'click e2' }))
    await screen.findByTestId('badge-e4')
    const calls = lookup.mock.calls.length
    fireEvent.click(screen.getByRole('button', { name: 'click e2' }))
    fireEvent.click(screen.getByRole('button', { name: 'click e2' }))
    await screen.findByTestId('badge-e4')
    expect(lookup.mock.calls.length).toBe(calls)
  })

  it('shows the comment map per move and accumulated, with progress (S20)', async () => {
    lookup.mockImplementation(async (fen: string) => (fen.includes(' b ') ? [found] : []))
    openBoard()
    fireEvent.click(screen.getByRole('button', { name: 'Comment map' }))
    expect(await screen.findByText('Analysed 20 moves')).toBeTruthy()
    expect(screen.getByTestId('map-c3').textContent).toBe('1')
    fireEvent.click(screen.getByRole('button', { name: 'Accumulated' }))
    expect(screen.getByTestId('map-c3').textContent).toMatch(/^2[NP]{2}$/)
    expect(screen.getByTestId('map-f3').textContent).toMatch(/^2[NP]{2}$/)
    fireEvent.click(screen.getByRole('button', { name: 'Comment map' }))
    expect(screen.queryByTestId('map-c3')).toBeNull()
  })

  it('hides a found comment after a confirmation and says so (S17)', async () => {
    lookup.mockResolvedValue([{ ...found, id: 5 }])
    hideComment.mockResolvedValue(undefined)
    render(<PositionFinder />)
    type(AFTER_E4)
    fireEvent.click(await screen.findByRole('button', { name: 'Hide' }))
    expect(hideComment).not.toHaveBeenCalled()
    expect(screen.getByText(/Hide this comment\? It stays in the database but is no longer shown\./)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Yes, hide' }))
    await waitFor(() => expect(hideComment).toHaveBeenCalledWith(5))
    expect(await screen.findByText(/Comment hidden/)).toBeTruthy()
    expect(screen.queryByText('The king pawn opens lines.')).toBeNull()
    expect(screen.getByText(/0 comments found for this position/)).toBeTruthy()
  })

  it('shows a failed hide inline and keeps the comment', async () => {
    lookup.mockResolvedValue([{ ...found, id: 5 }])
    hideComment.mockRejectedValue(new Error('The comments database is read-only here'))
    render(<PositionFinder />)
    type(AFTER_E4)
    fireEvent.click(await screen.findByRole('button', { name: 'Hide' }))
    fireEvent.click(screen.getByRole('button', { name: 'Yes, hide' }))
    expect((await screen.findByText('The comments database is read-only here')).getAttribute('role')).toBe('alert')
    expect(screen.getByText('The king pawn opens lines.')).toBeTruthy()
  })
})

describe('Find by position: one line shared by text, moves, suggestions and board (S22)', () => {
  const box = () => screen.getByRole('textbox', { name: 'FEN or PGN' }) as HTMLTextAreaElement

  it('walks a suggestion with Forward, Back, Last and First, and the comments follow the ply', async () => {
    render(<PositionFinder />)
    fireEvent.click(screen.getByRole('button', { name: 'Ruy Lopez' }))
    expect(box().value).toBe('1. e4 e5 2. Nf3 Nc6 3. Bb5')
    const list = screen.getByRole('list', { name: 'Moves' })
    fireEvent.click(screen.getByRole('button', { name: 'Last move' }))
    await waitFor(() => expect(within(list).getByRole('button', { name: '3. Bb5' }).getAttribute('aria-pressed')).toBe('true'))
    fireEvent.click(screen.getByRole('button', { name: 'Back' }))
    await waitFor(() => expect(within(list).getByRole('button', { name: '2... Nc6' }).getAttribute('aria-pressed')).toBe('true'))
    fireEvent.click(screen.getByRole('button', { name: 'First move' }))
    await waitFor(() => expect(lookup).toHaveBeenLastCalledWith(START_FEN))
    expect(box().value).toBe('1. e4 e5 2. Nf3 Nc6 3. Bb5')
  })

  it('auto-plays one move a second and can pause', async () => {
    vi.useFakeTimers()
    try {
      render(<PositionFinder />)
      fireEvent.click(screen.getByRole('button', { name: 'Ruy Lopez' }))
      fireEvent.click(screen.getByRole('button', { name: 'Play' }))
      await act(async () => { await vi.advanceTimersByTimeAsync(1100) })
      await act(async () => { await vi.advanceTimersByTimeAsync(1100) })
      expect(screen.getByRole('button', { name: '2. Nf3' }).getAttribute('aria-pressed')).toBe('false')
      expect(screen.getByRole('button', { name: '1... e5' }).getAttribute('aria-pressed')).toBe('true')
      fireEvent.click(screen.getByRole('button', { name: 'Pause' }))
      await act(async () => { await vi.advanceTimersByTimeAsync(3000) })
      expect(screen.getByRole('button', { name: '1... e5' }).getAttribute('aria-pressed')).toBe('true')
    } finally {
      vi.useRealTimers()
    }
  })

  it('loads typed moves into the board and highlights the selected ply', async () => {
    render(<PositionFinder />)
    fireEvent.click(screen.getByRole('button', { name: 'Board' }))
    type('1. e4 e5 2. Nf3')
    const list = await screen.findByRole('list', { name: 'Moves' })
    fireEvent.click(within(list).getByRole('button', { name: '1. e4' }))
    await waitFor(() => expect(lookup).toHaveBeenLastCalledWith(AFTER_E4))
    expect(within(list).getByRole('button', { name: '1. e4' }).getAttribute('aria-pressed')).toBe('true')
  })

  it('reads the text after a short pause, without pressing Find', async () => {
    render(<PositionFinder />)
    fireEvent.change(box(), { target: { value: '1 e4 e5' } })
    expect(await screen.findByRole('list', { name: 'Moves' }, { timeout: 2000 })).toBeTruthy()
    await waitFor(() => expect(box().value).toBe('1. e4 e5'))
  })

  it('writes the moves played on the board back into the text, truncating from the middle', async () => {
    render(<PositionFinder />)
    fireEvent.click(screen.getByRole('button', { name: 'Ruy Lopez' }))
    fireEvent.click(screen.getByRole('button', { name: 'First move' }))
    fireEvent.click(screen.getByRole('button', { name: 'drop e2e4' }))
    fireEvent.click(screen.getByRole('button', { name: 'drop e7e5' }))
    expect(box().value).toBe('1. e4 e5 2. Nf3 Nc6 3. Bb5')
    fireEvent.click(screen.getByRole('button', { name: 'First move' }))
    fireEvent.click(screen.getByRole('button', { name: 'drop e2e4' }))
    fireEvent.click(screen.getByRole('button', { name: 'Forward' }))
    fireEvent.click(screen.getByRole('button', { name: 'Back' }))
    fireEvent.click(screen.getByRole('button', { name: 'drop e7e5' }))
    expect(box().value).toBe('1. e4 e5 2. Nf3 Nc6 3. Bb5')
  })

  it('a different move from the middle replaces the rest of the line', async () => {
    render(<PositionFinder />)
    fireEvent.click(screen.getByRole('button', { name: 'Ruy Lopez' }))
    fireEvent.click(screen.getByRole('button', { name: 'Forward' }))
    fireEvent.click(screen.getByRole('button', { name: 'Forward' }))
    fireEvent.click(screen.getByRole('button', { name: 'Back' }))
    // From 1. e4 the mock board plays e7e5 only, which is the line itself: the text is unchanged.
    expect(box().value).toBe('1. e4 e5 2. Nf3 Nc6 3. Bb5')
    fireEvent.click(screen.getByRole('button', { name: 'Reset' }))
    expect(box().value).toBe('')
    fireEvent.click(screen.getByRole('button', { name: 'drop e2e4' }))
    expect(box().value).toBe('1. e4')
  })

  it('keeps the board where it is when the text is wrong and shows the error', async () => {
    render(<PositionFinder />)
    fireEvent.click(screen.getByRole('button', { name: 'Ruy Lopez' }))
    fireEvent.click(screen.getByRole('button', { name: 'Last move' }))
    type('1. e4 e5 2. Nf3 N@c6')
    expect((await screen.findByRole('alert')).textContent).toMatch(/N@c6/)
    expect(screen.getByTestId('board').getAttribute('data-fen')).toMatch(/1B2p3/)
  })

  it('a FEN in the text sets the start position of the board', async () => {
    render(<PositionFinder />)
    fireEvent.click(screen.getByRole('button', { name: 'Board' }))
    type(AFTER_E4)
    await waitFor(() => expect(screen.getByTestId('board').getAttribute('data-fen')).toBe(AFTER_E4))
    fireEvent.click(screen.getByRole('button', { name: 'drop e7e5' }))
    expect(box().value).toContain('1... e5')
    expect(box().value).toContain('[FEN "' + AFTER_E4 + '"]')
  })
})
