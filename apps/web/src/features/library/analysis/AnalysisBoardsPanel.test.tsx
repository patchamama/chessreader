import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import type { CSSProperties } from 'react'
import { AnalysisBoardsPanel } from './AnalysisBoardsPanel'
import { setAnalysisSpeaker } from './analysisSpeaker'
import { useAnalysisBoards, openAnalysisBoard } from './analysisBoards'
import { useSettingsStore } from '../../../shared/settings/settingsStore'
import { useStudyBoardStore } from '../store/studyBoardStore'

vi.mock('../../../shared/chess/ChessBoard', () => ({
  default: ({ fen, customSquareStyles, orientation }: { fen: string; customSquareStyles?: Record<string, CSSProperties>; orientation?: string }) => (
    <div data-testid="board" data-orientation={orientation} data-squares={Object.keys(customSquareStyles ?? {}).sort().join(',')}>{fen}</div>
  ),
}))

const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'
const AFTER_E4 = 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1'
const AFTER_E5 = 'rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2'
const AFTER_D4_D5 = 'rnbqkbnr/ppp1pppp/8/3p4/3P4/8/PPP1PPPP/RNBQKBNR w KQkq - 0 2'

const panel = () => screen.getByRole('complementary', { name: /^(Analysis boards|Tableros de análisis)$/ })
const board = () => within(panel()).getByTestId('board')

beforeEach(() => {
  useAnalysisBoards.setState({ boards: [], active: null })
  useSettingsStore.setState({ language: 'en', diagramEvalThumbs: false })
})
afterEach(() => vi.useRealTimers())

describe('AnalysisBoardsPanel (S4: several analysis boards, opened and closed one by one)', () => {
  it('shows nothing while no board is open', () => {
    render(<AnalysisBoardsPanel />)
    expect(screen.queryByRole('complementary', { name: 'Analysis boards' })).toBeNull()
  })

  it('has a tab per board, switches between them and closing one keeps the other', () => {
    render(<AnalysisBoardsPanel />)
    act(() => {
      openAnalysisBoard({ title: 'Variation', startFen: START, moves: ['e4', 'e5'], text: 'The main line.' })
      openAnalysisBoard({ title: 'Book comment', pgn: '[Event "x"]\n\n1. d4 {quiet} d5 (1... Nf6 2. c4) *', ply: 2, text: 'A quiet start.', source: 'Kasparov, Predecessors I' })
    })
    const tabs = within(panel()).getAllByRole('tab')
    expect(tabs.map((t) => t.textContent)).toEqual(['Variation', 'Book comment'])
    // The newest is active: its text, its source and its position at the ply.
    expect(within(panel()).getByText('A quiet start.')).toBeTruthy()
    expect(within(panel()).getByText('Kasparov, Predecessors I')).toBeTruthy()
    expect(board().textContent).toBe(AFTER_D4_D5)

    fireEvent.click(tabs[0])
    expect(within(panel()).getByText('The main line.')).toBeTruthy()
    expect(board().textContent).toBe(START)

    fireEvent.click(within(panel()).getByRole('button', { name: 'Close Variation' }))
    expect(within(panel()).getAllByRole('tab').map((t) => t.textContent)).toEqual(['Book comment'])
    expect(useAnalysisBoards.getState().boards.map((b) => b.title)).toEqual(['Book comment'])
    expect(within(panel()).getByText('A quiet start.')).toBeTruthy()
  })

  it('steps through the moves (first, previous, next, last) and jumps to a clicked move', () => {
    render(<AnalysisBoardsPanel />)
    act(() => { openAnalysisBoard({ title: 'Line', startFen: START, moves: ['e4', 'e5'] }) })
    const p = within(panel())
    expect(board().textContent).toBe(START)
    fireEvent.click(p.getByRole('button', { name: 'Next move' }))
    expect(board().textContent).toBe(AFTER_E4)
    fireEvent.click(p.getByRole('button', { name: 'Last move' }))
    expect(board().textContent).toBe(AFTER_E5)
    fireEvent.click(p.getByRole('button', { name: 'Previous move' }))
    expect(board().textContent).toBe(AFTER_E4)
    fireEvent.click(p.getByRole('button', { name: 'First position' }))
    expect(board().textContent).toBe(START)
    fireEvent.click(p.getByRole('button', { name: 'e5' }))
    expect(board().textContent).toBe(AFTER_E5)
  })

  it('plays the line by itself, one move a second', () => {
    vi.useFakeTimers()
    render(<AnalysisBoardsPanel />)
    act(() => { openAnalysisBoard({ title: 'Line', startFen: START, moves: ['e4', 'e5'] }) })
    fireEvent.click(within(panel()).getByRole('button', { name: 'Play' }))
    act(() => { vi.advanceTimersByTime(1000) })
    expect(board().textContent).toBe(AFTER_E4)
    act(() => { vi.advanceTimersByTime(1000) })
    expect(board().textContent).toBe(AFTER_E5)
  })

  it('collapses and expands', () => {
    render(<AnalysisBoardsPanel />)
    act(() => { openAnalysisBoard({ title: 'Line', startFen: START, moves: ['e4'] }) })
    fireEvent.click(within(panel()).getByRole('button', { name: 'Collapse the analysis boards' }))
    expect(within(panel()).queryByTestId('board')).toBeNull()
    fireEvent.click(within(panel()).getByRole('button', { name: 'Expand the analysis boards' }))
    expect(within(panel()).getByTestId('board')).toBeTruthy()
  })

  it('narrates the comment in the chosen language, playing its moves and lighting what it names on this board only', async () => {
    useSettingsStore.setState({ language: 'es' })
    const studyBefore = useStudyBoardStore.getState()
    const said: string[] = []
    let releaseLast: (() => void) | null = null
    setAnalysisSpeaker({
      speak: (text) => {
        said.push(text)
        return new Promise<void>((resolve) => { releaseLast = resolve; if (said.length < 2) resolve() })
      },
      cancel: () => releaseLast?.(),
    })
    render(<AnalysisBoardsPanel />)
    act(() => { openAnalysisBoard({ title: 'Comentario', startFen: START, moves: ['e4', 'e5'], text: 'Tras 1. e4 la casilla d5 queda débil.' }) })
    fireEvent.click(within(panel()).getByRole('button', { name: 'Narrar' }))
    await waitFor(() => expect(said.length).toBe(2))
    expect(said.join(' ')).toMatch(/Tras/)
    // While the move's part is said, the board shows it and lights the square named.
    expect(board().textContent).toBe(AFTER_E4)
    expect(board().getAttribute('data-squares')).toContain('d5')
    await act(async () => { releaseLast?.() })
    expect(useStudyBoardStore.getState()).toBe(studyBefore)
  })
})

describe('AnalysisBoardsPanel (S17: an analysis board can always be flipped)', () => {
  it('has a flip-board button that turns the board round and back', () => {
    render(<AnalysisBoardsPanel />)
    act(() => { openAnalysisBoard({ title: 'Variation', startFen: START, moves: ['e4', 'e5'] }) })
    expect(board()).toHaveAttribute('data-orientation', 'white')
    fireEvent.click(within(panel()).getByRole('button', { name: 'Flip board' }))
    expect(board()).toHaveAttribute('data-orientation', 'black')
    fireEvent.click(within(panel()).getByRole('button', { name: 'Flip board' }))
    expect(board()).toHaveAttribute('data-orientation', 'white')
  })
})
