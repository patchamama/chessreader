import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

const llm = vi.hoisted(() => ({ available: false, vision: false, complete: vi.fn() }))
const BOARDS = vi.hoisted(() => ({} as Record<string, string>))
vi.mock('../../../shared/llm', () => ({ useLlm: () => ({ ...llm, config: null }) }))
vi.mock('./imageData', async () => {
  const { drawBoard } = await import('./syntheticBoard.testutil')
  return {
    imageDataUrl: vi.fn().mockResolvedValue('data:image/png;base64,AAAA'),
    imageDataOf: vi.fn(async (src: string) => drawBoard(BOARDS[src])),
  }
})
vi.mock('../../suggestions/suggestionsApi', () => ({
  saveSuggestion: vi.fn().mockResolvedValue({ saved: true, where: 'server', path: 'p' }),
}))

import { readingFromFen } from '@chess-ebook/chess-shared'
import { ImageAiMenu } from './ImageAiMenu'
import { saveSuggestion } from '../../suggestions/suggestionsApi'
import { useSessionFenStore } from './sessionFens'
import { useSquareBank } from './squareBank'
import { useErrataContext } from '../errata/errataContext'
import { registerDiagram } from './diagramRegistry'

const save = vi.mocked(saveSuggestion)
// Images are cached by src for the session: every test has its own.
let KNOWN = '', SRC = '', n = 0
const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR'
// The black king stands on a dark square: the book's known diagram never showed it there.
const UNKNOWN = 'rnbq1bnr/pppppppp/8/8/3k4/8/PPPPPPPP/RNBQKBNR'

beforeEach(() => {
  vi.clearAllMocks()
  localStorage.clear()
  n++
  KNOWN = `/api/library/books/31/images/known${n}.png`
  SRC = `/api/library/books/31/images/unknown${n}.png`
  Object.assign(llm, { available: false, vision: false })
  useSessionFenStore.setState({ fens: {} })
  useSquareBank.setState({ banks: {} })
  useErrataContext.setState({ bookId: 31, bookTitle: 'Synthetic', chapter: 1, applied: [] })
  BOARDS[KNOWN] = START
  BOARDS[SRC] = UNKNOWN
})

const startReading = async () => {
  await userEvent.click(screen.getByRole('button', { name: 'AI actions for this image' }))
  await userEvent.click(screen.getByRole('menuitem', { name: 'Read this diagram (learn from the book)' }))
}

describe('ImageAiMenu: reading a diagram with the learning bank', () => {
  it('learns from the known diagram, asks about the doubtful square, learns the answer and saves the FEN as the user\'s', async () => {
    const off = registerDiagram({ src: KNOWN, followingText: '', printedFen: `${START} w KQkq - 0 1`, element: null })
    const onFen = vi.fn()
    render(<ImageAiMenu src={SRC} alt="d" followingText="12...Nc6 13.d4" onFen={onFen} />)
    await startReading()
    const dialog = await screen.findByRole('dialog', { name: 'Which piece is this?' })
    expect(within(dialog).getByText('Doubt 1 of 1')).toBeInTheDocument()
    expect(within(dialog).getByText('d4')).toBeInTheDocument()
    expect(within(dialog).getByRole('button', { name: 'Skip' })).toBeInTheDocument()
    await userEvent.click(within(dialog).getByRole('button', { name: 'Black king' }))
    // The answer is in the bank and the board is read again.
    expect(await screen.findByRole('region', { name: 'Position read' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'd4: Black king' })).toBeInTheDocument()
    expect(screen.getByText(/\d+ squares learned for this book/)).toBeInTheDocument()
    expect(screen.getByLabelText('Side to move')).toHaveValue('b')
    await userEvent.click(screen.getByRole('checkbox', { name: 'White kingside (K)' }))
    await userEvent.click(screen.getByRole('checkbox', { name: 'White queenside (Q)' }))
    await userEvent.click(screen.getByRole('button', { name: 'Accept' }))
    await waitFor(() => expect(save).toHaveBeenCalled())
    const s = save.mock.calls[0][0]
    expect(s).toMatchObject({ kind: 'diagram-fen', author: 'user', target: { image: SRC }, after: { fen: 'rnbq1bnr/pppppppp/8/8/3k4/8/PPPPPPPP/RNBQKBNR b KQ - 0 12' } })
    expect(useSessionFenStore.getState().fens[SRC]).toBe('rnbq1bnr/pppppppp/8/8/3k4/8/PPPPPPPP/RNBQKBNR b KQ - 0 12')
    expect(onFen).toHaveBeenCalled()
    off()
  })

  it('an invalid board says what is wrong, lets the user fix a square and blocks Accept meanwhile', async () => {
    BOARDS[SRC] = START
    const off = registerDiagram({ src: KNOWN, followingText: '', printedFen: `${START} w KQkq - 0 1`, element: null })
    render(<ImageAiMenu src={SRC} alt="d" followingText="" />)
    await startReading()
    const region = await screen.findByRole('region', { name: 'Position read' })
    expect(within(region).getByRole('button', { name: 'Accept' })).toBeEnabled()
    // Correct e8 (the black king) to empty: Black has no king.
    await userEvent.click(within(region).getByRole('button', { name: 'e8: Black king' }))
    await userEvent.click(within(region).getByRole('button', { name: 'Set e8 to Empty' }))
    expect(within(region).getByText('Black has no king.')).toBeInTheDocument()
    expect(within(region).getByRole('button', { name: 'Accept' })).toBeDisabled()
    off()
  })

  it('"I do not know" marks the FEN as approximate in the suggestion note', async () => {
    BOARDS[SRC] = START
    const off = registerDiagram({ src: KNOWN, followingText: '', printedFen: `${START} w KQkq - 0 1`, element: null })
    render(<ImageAiMenu src={SRC} alt="d" followingText="" />)
    await startReading()
    const region = await screen.findByRole('region', { name: 'Position read' })
    await userEvent.selectOptions(within(region).getByLabelText('Side to move'), 'unknown')
    await userEvent.click(within(region).getByRole('button', { name: 'Accept' }))
    await waitFor(() => expect(save).toHaveBeenCalled())
    expect(save.mock.calls[0][0].after).toMatchObject({ fen: `${START} w - - 0 1`, note: expect.stringMatching(/approximate/i) })
    off()
  })

  it('without any learned square every square is a doubt and the user can export the bank', async () => {
    render(<ImageAiMenu src={SRC} alt="d" followingText="" />)
    await startReading()
    const dialog = await screen.findByRole('dialog', { name: 'Which piece is this?' })
    expect(within(dialog).getByText('Doubt 1 of 64')).toBeInTheDocument()
    await userEvent.click(within(dialog).getByRole('button', { name: 'White rook' }))
    expect(useSquareBank.getState().banks['31']).toHaveLength(1)
    expect(await screen.findByRole('dialog', { name: 'Which piece is this?' })).toBeInTheDocument()
  })

  it('a vision model is one more vote: it suggests the candidate, the user decides, the suggestion is the AI\'s', async () => {
    Object.assign(llm, { available: true, vision: true })
    llm.complete.mockResolvedValue({ text: JSON.stringify({ sideToMove: 'b', squares: readingFromFen(UNKNOWN, 0.9) }), model: 'llava' })
    const off = registerDiagram({ src: KNOWN, followingText: '', printedFen: `${START} w KQkq - 0 1`, element: null })
    render(<ImageAiMenu src={SRC} alt="d" followingText="12...Nc6" />)
    await startReading()
    const dialog = await screen.findByRole('dialog', { name: 'Which piece is this?' })
    await waitFor(() => expect(within(dialog).getAllByRole('button')[0]).toHaveAccessibleName('Likely: Black king'))
    await userEvent.click(within(dialog).getByRole('button', { name: 'Likely: Black king' }))
    await userEvent.click(await screen.findByRole('button', { name: 'Accept' }))
    await waitFor(() => expect(save).toHaveBeenCalled())
    expect(save.mock.calls[0][0]).toMatchObject({ author: 'ai', model: 'llava' })
    off()
  })
})
