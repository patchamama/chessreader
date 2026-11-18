import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { recognizeGames } from '@chess-ebook/chess-shared'
import AnalysisPage from './AnalysisPage'
import { openAnalysisBoard, useAnalysisBoards } from './analysisBoards'
import { useStudyBoardStore } from '../store/studyBoardStore'
import { useSettingsStore } from '../../../shared/settings/settingsStore'

vi.mock('../../../shared/chess/ChessBoard', () => ({
  default: ({ fen }: { fen: string }) => <div data-testid="board">{fen}</div>,
}))
// The study board itself (engine, eval bar…) is covered elsewhere; here it only has to be there.
vi.mock('../components/StudyBoard', () => ({
  StudyBoard: () => <div data-testid="study-board">study board</div>,
}))

const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'

const tabs = () => within(screen.getByRole('tablist', { name: 'Analysis boards' }))

beforeEach(() => {
  useAnalysisBoards.setState({ boards: [], active: null })
  useStudyBoardStore.getState().reset()
  useSettingsStore.setState({ language: 'en', notationStyle: 'letters', diagramEvalThumbs: false })
})

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
    expect(screen.getByTestId('study-board')).toBeInTheDocument()
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
