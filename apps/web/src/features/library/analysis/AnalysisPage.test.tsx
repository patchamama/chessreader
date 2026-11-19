import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { Chess } from 'chess.js'
import { recognizeGames } from '@chess-ebook/chess-shared'
import AnalysisPage from './AnalysisPage'
import { openAnalysisBoard, useAnalysisBoards } from './analysisBoards'
import { useStudyBoardStore } from '../store/studyBoardStore'
import { setReviewEngine } from '../review/reviewStore'
import { clearLineQualityCache } from './useLineQualities'
import { clearMoveHintCache } from '../review/useMoveHints'
import { useSettingsStore } from '../../../shared/settings/settingsStore'

// The board: its position and orientation, and the last props (to play a move on it).
const boardProps: { current: { onPieceDrop?: (from: string, to: string) => boolean } } = { current: {} }
vi.mock('../../../shared/chess/ChessBoard', () => ({
  default: (p: { fen: string; orientation?: string; onPieceDrop?: (from: string, to: string) => boolean }) => {
    boardProps.current = p
    return <div data-testid="board" data-orientation={p.orientation}>{p.fen}</div>
  },
}))
// No engine worker in tests: the eval bar and lines are covered elsewhere.
vi.mock('../../../shared/stockfish/useEngineLines', () => ({ useEngineLines: () => ({ lines: [], loading: false, depth: 0 }) }))
vi.mock('../../viewer/components/EvalBar', () => ({ default: () => <div data-testid="eval-bar" /> }))
vi.mock('../components/EngineEvalPanel', () => ({ EngineEvalPanel: () => <div data-testid="engine-lines" /> }))
const recomment = vi.fn(async () => '1. e4\nOpens the centre.\n1... e5')
vi.mock('../review/recommentGame', () => ({ recommentGame: () => recomment() }))
// The study board itself (engine, eval bar…) is covered elsewhere; here it only has to be there.
vi.mock('../components/StudyBoard', () => ({
  StudyBoard: () => <div data-testid="study-board">study board</div>,
}))

const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'

const tabs = () => within(screen.getByRole('tablist', { name: 'Analysis boards' }))

// The engine: every legal move is even, except f2-f3 (a blunder) and e2-e4 (the best).
const SCORES: Record<string, number> = { e2e4: 40, f2f3: -400 }
function fakeEngine(fen: string) {
  const moves = new Chess(fen).moves({ verbose: true })
  return Promise.resolve(moves.map((m, idx) => ({ idx, pv: [`${m.from}${m.to}`], scoreCp: SCORES[`${m.from}${m.to}`] ?? 0, depth: 8 }))
    .sort((a, b) => (b.scoreCp ?? 0) - (a.scoreCp ?? 0)))
}

beforeEach(() => {
  useAnalysisBoards.setState({ boards: [], active: null, scratch: null })
  useStudyBoardStore.getState().reset()
  useSettingsStore.setState({ language: 'en', notationStyle: 'letters', diagramEvalThumbs: false, moveHints: true, hintEval: false, showEval: true })
  clearLineQualityCache()
  clearMoveHintCache()
  setReviewEngine(fakeEngine)
})
afterEach(() => setReviewEngine(null))

describe('AnalysisPage (S11: the analysis board tab)', () => {
  it('always shows the current analysis board: the study board with its game moves', () => {
    const tree = recognizeGames('1. e4 e5 2. Nf3 Nc6 3. Bb5')[0].tree
    act(() => useStudyBoardStore.getState().loadPosition(tree, tree.mainline[2], false))
    render(<AnalysisPage />)
    expect(tabs().getByRole('tab', { name: 'Current board' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByTestId('study-board')).toBeInTheDocument()
    const moves = screen.getByRole('list', { name: 'Moves' })
    expect(within(moves).getByRole('button', { name: 'Nf3' })).toHaveAttribute('aria-current', 'true')
    // Clicking a move moves the study board there (it is the same, live board).
    fireEvent.click(within(moves).getByRole('button', { name: 'Bb5' }))
    expect(useStudyBoardStore.getState().currentNodeId).toBe(tree.mainline[4])
  })

  it('writes the moves with the chosen notation', () => {
    const tree = recognizeGames('1. e4 e5 2. Nf3 Nc6 3. Bb5')[0].tree
    act(() => useStudyBoardStore.getState().loadPosition(tree, null, false))
    useSettingsStore.setState({ language: 'es' })
    render(<AnalysisPage />)
    expect(within(screen.getByRole('list', { name: 'Jugadas' })).getByRole('button', { name: 'Cf3' })).toBeInTheDocument()
    act(() => useSettingsStore.setState({ notationStyle: 'figurine' }))
    expect(within(screen.getByRole('list', { name: 'Jugadas' })).getByRole('button', { name: '♞f3' })).toBeInTheDocument()
  })

  it('has one tab per extra board, named after its book, switches to it and closes it', () => {
    render(<AnalysisPage />)
    act(() => {
      openAnalysisBoard({ title: '1. e4 e5', startFen: START, moves: ['e4', 'e5'], source: 'My System' })
      openAnalysisBoard({ title: 'A comment', startFen: START, moves: ['d4'] })
    })
    expect(tabs().getByRole('tab', { name: 'My System' })).toBeInTheDocument()
    expect(tabs().getByRole('tab', { name: 'A comment' })).toBeInTheDocument()

    fireEvent.click(tabs().getByRole('tab', { name: 'My System' }))
    expect(tabs().getByRole('tab', { name: 'My System' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.queryByTestId('study-board')).toBeNull()
    expect(screen.getByTestId('analysis-board')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Close My System' }))
    expect(tabs().queryByRole('tab', { name: 'My System' })).toBeNull()
    expect(useAnalysisBoards.getState().boards.map((b) => b.title)).toEqual(['A comment'])
    // The current board can never be closed.
    expect(screen.queryByRole('button', { name: 'Close Current board' })).toBeNull()
  })

  it('goes back to the current board when the board shown is closed', () => {
    render(<AnalysisPage />)
    act(() => { openAnalysisBoard({ title: 'Line', startFen: START, moves: ['e4'], source: 'Book A' }) })
    fireEvent.click(tabs().getByRole('tab', { name: 'Book A' }))
    fireEvent.click(screen.getByRole('button', { name: 'Close Book A' }))
    expect(tabs().getByRole('tab', { name: 'Current board' })).toHaveAttribute('aria-selected', 'true')
    // No game of a book is open: the current board is a free analysis board.
    expect(screen.getByTestId('analysis-board')).toBeInTheDocument()
  })

  it('an extra board offers the notation toggle (S12) and writes its moves with it', () => {
    render(<AnalysisPage />)
    act(() => { openAnalysisBoard({ title: 'Line', startFen: START, moves: ['e4', 'e5', 'Nf3'], source: 'Book A' }) })
    fireEvent.click(tabs().getByRole('tab', { name: 'Book A' }))
    const board = screen.getByTestId('analysis-board')
    expect(within(board).getByRole('button', { name: 'Nf3' })).toBeInTheDocument()
    fireEvent.click(within(board).getByRole('button', { name: 'Show pieces as figurines' }))
    expect(useSettingsStore.getState().notationStyle).toBe('figurine')
    expect(within(board).getByRole('button', { name: '♞f3' })).toBeInTheDocument()
    expect(within(board).getByRole('button', { name: 'Show pieces as letters' })).toBeInTheDocument()
  })
})

const play = (from: string, to: string) => act(() => { boardProps.current.onPieceDrop?.(from, to) })
const moves = () => within(screen.getByRole('list', { name: 'Moves' }))

describe('AnalysisPage (S10: the analysis board works like a game opened in a book)', () => {
  it('the moves of the game keep their height beside the board: never stretched to fill it', () => {
    const tree = recognizeGames('1. e4 e5 2. Nf3 Nc6 3. Bb5')[0].tree
    act(() => useStudyBoardStore.getState().loadPosition(tree, null, false))
    render(<AnalysisPage />)
    const list = screen.getByRole('list', { name: 'Moves' })
    expect(list.className).toMatch(/\bself-start\b/)
    expect(list.className).toMatch(/\bcontent-start\b/)
    expect(list.className).not.toMatch(/justify-between|h-full|flex-1/)
  })

  it('with no game open, the moves played on the board are listed beside it, coloured by how good they are', async () => {
    render(<AnalysisPage />)
    expect(screen.queryByTestId('study-board')).toBeNull()
    play('e2', 'e4')
    expect(screen.getByTestId('board')).toHaveTextContent('rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1')
    play('e7', 'e5')
    expect(moves().getByRole('button', { name: 'e5' })).toHaveAttribute('aria-current', 'true')
    await waitFor(() => expect(moves().getByRole('button', { name: 'e4' })).toHaveAttribute('data-quality', 'good'))
    // Back to the start, then a bad move: the line goes on with it, in red.
    fireEvent.click(screen.getByRole('button', { name: 'First position' }))
    play('f2', 'f3')
    expect(moves().queryByRole('button', { name: 'e4' })).toBeNull()
    await waitFor(() => expect(moves().getByRole('button', { name: 'f3' })).toHaveAttribute('data-quality', 'bad'))
    expect(moves().getByRole('button', { name: 'f3' }).style.color).not.toBe('')
  })

  it('hovering a move shows its thumbnail', () => {
    render(<AnalysisPage />)
    play('d2', 'd4')
    fireEvent.mouseEnter(moves().getByRole('button', { name: 'd4' }), { clientX: 10, clientY: 400 })
    expect(screen.getByTestId('move-thumbnail')).toBeInTheDocument()
    fireEvent.mouseLeave(moves().getByRole('button', { name: 'd4' }))
    expect(screen.queryByTestId('move-thumbnail')).toBeNull()
  })

  it('a game typed or pasted (with a FEN line) is shown on the board after "Apply"', () => {
    render(<AnalysisPage />)
    fireEvent.click(screen.getByRole('button', { name: 'Edit the game text' }))
    fireEvent.change(screen.getByRole('textbox', { name: 'Game text' }), { target: { value: '6k1/5ppp/8/8/8/8/5PPP/4R1K1 w - - 0 1\n1. Re8# The back rank.' } })
    fireEvent.click(screen.getByRole('button', { name: 'Apply' }))
    expect(screen.queryByRole('textbox', { name: 'Game text' })).toBeNull()
    expect(moves().getByRole('button', { name: 'Re8#' })).toHaveAttribute('aria-current', 'true')
    expect(screen.getByTestId('board')).toHaveTextContent('4R1k1/5ppp/8/8/8/8/5PPP/6K1 b - - 1 1')
    expect(screen.getByTestId('analysis-text')).toHaveTextContent('The back rank.')
    // A text with no game nor position is refused, the edit stays open.
    fireEvent.click(screen.getByRole('button', { name: 'Edit the game text' }))
    fireEvent.change(screen.getByRole('textbox', { name: 'Game text' }), { target: { value: 'nothing here' } })
    fireEvent.click(screen.getByRole('button', { name: 'Apply' }))
    expect(screen.getByRole('alert')).toHaveTextContent('No game or position found')
    expect(screen.getByRole('textbox', { name: 'Game text' })).toBeInTheDocument()
  })

  it('has the tools of a book: flip, hide the board, comment, paragraphs or braces, downloads, eval bar and engine lines', async () => {
    const createObjectURL = vi.fn(() => 'blob:x')
    Object.assign(URL, { createObjectURL, revokeObjectURL: vi.fn() })
    render(<AnalysisPage />)
    expect(screen.getByTestId('eval-bar')).toBeInTheDocument()
    expect(screen.getByTestId('engine-lines')).toBeInTheDocument()
    play('e2', 'e4')
    fireEvent.click(screen.getByRole('button', { name: 'Flip board' }))
    expect(screen.getByTestId('board')).toHaveAttribute('data-orientation', 'black')
    fireEvent.click(screen.getByRole('button', { name: 'Hide board' }))
    expect(screen.queryByTestId('board')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Show board' }))
    expect(screen.getByTestId('board')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Comment the game' }))
    await waitFor(() => expect(screen.getByTestId('analysis-text')).toHaveTextContent('Opens the centre.'))
    fireEvent.click(screen.getByRole('button', { name: 'Comments in braces' }))
    expect(screen.getByTestId('analysis-text')).toHaveTextContent('{ Opens the centre. }')
    fireEvent.click(screen.getByRole('button', { name: 'Comments as paragraphs' }))
    expect(screen.getByTestId('analysis-text').textContent).not.toContain('{')

    expect(screen.queryByRole('menu')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'More options' }))
    const menu = screen.getByRole('menu')
    expect(within(menu).getByRole('menuitem', { name: 'Download PDF' })).toBeInTheDocument()
    fireEvent.click(within(menu).getByRole('menuitem', { name: 'Download PGN' }))
    expect(createObjectURL).toHaveBeenCalled()
    expect(screen.queryByRole('menu')).toBeNull()
  })

  it('"+" opens a new analysis tab with an empty board; tabs keep what was played and close', () => {
    render(<AnalysisPage />)
    fireEvent.click(tabs().getByRole('button', { name: 'New analysis board' }))
    const tab = tabs().getByRole('tab', { name: 'Analysis 1' })
    expect(tab).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByTestId('board')).toHaveTextContent('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1')
    play('g1', 'f3')
    fireEvent.click(tabs().getByRole('tab', { name: 'Current board' }))
    expect(screen.queryByRole('button', { name: 'Nf3' })).toBeNull()
    play('c2', 'c4')
    fireEvent.click(tabs().getByRole('tab', { name: 'Analysis 1' }))
    expect(moves().getByRole('button', { name: 'Nf3' })).toBeInTheDocument()
    fireEvent.click(tabs().getByRole('tab', { name: 'Current board' }))
    expect(moves().getByRole('button', { name: 'c4' })).toBeInTheDocument()
    // A second "+" is another board; closing one keeps the other.
    fireEvent.click(tabs().getByRole('button', { name: 'New analysis board' }))
    expect(tabs().getByRole('tab', { name: 'Analysis 2' })).toHaveAttribute('aria-selected', 'true')
    fireEvent.click(screen.getByRole('button', { name: 'Close Analysis 1' }))
    expect(tabs().queryByRole('tab', { name: 'Analysis 1' })).toBeNull()
    expect(tabs().getByRole('tab', { name: 'Analysis 2' })).toBeInTheDocument()
  })

  it('a board opened from a book keeps its line, plays on from it and narrates its comment', () => {
    render(<AnalysisPage />)
    act(() => { openAnalysisBoard({ title: 'Line', startFen: START, moves: ['e4', 'e5'], ply: 1, text: 'White opens.', source: 'Book A' }) })
    expect(moves().getByRole('button', { name: 'e4' })).toHaveAttribute('aria-current', 'true')
    expect(screen.getByRole('button', { name: 'Narrate' })).toBeInTheDocument()
    expect(within(screen.getByTestId('analysis-board')).getByText('Book A')).toBeInTheDocument()
    play('c7', 'c5')
    expect(moves().queryByRole('button', { name: 'e5' })).toBeNull()
    expect(moves().getByRole('button', { name: 'c5' })).toHaveAttribute('aria-current', 'true')
  })
})
