import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { recognizeGames } from '@chess-ebook/chess-shared'
import AnalysisPage from './AnalysisPage'
import { useAnalysisBoards } from './analysisBoards'
import { useStudyBoardStore } from '../store/studyBoardStore'
import { useSettingsStore } from '../../../shared/settings/settingsStore'
import { lookupPositionComments, type HumanComment } from '../commentdb/commentLookup'

vi.mock('../../../shared/chess/ChessBoard', () => ({
  default: (p: { fen: string; onPieceDrop?: (from: string, to: string) => boolean }) => (
    <div data-testid="board">{p.fen}<button onClick={() => p.onPieceDrop?.('e2', 'e4')}>play-e4</button></div>
  ),
}))
vi.mock('../../../shared/stockfish/useEngineLines', () => ({ useEngineLines: () => ({ lines: [], loading: false, depth: 0 }) }))
vi.mock('../../viewer/components/EvalBar', () => ({ default: () => <div /> }))
vi.mock('../components/EngineEvalPanel', () => ({ EngineEvalPanel: () => <div /> }))
vi.mock('../components/StudyBoard', () => ({ StudyBoard: () => <div data-testid="study-board" /> }))
vi.mock('../../database/CommentDetailsModal', () => ({ default: () => <div role="dialog" aria-label="editor" /> }))
vi.mock('../commentdb/commentLookup', async (orig) => ({
  ...(await orig<typeof import('../commentdb/commentLookup')>()),
  lookupPositionComments: vi.fn(async () => []),
}))

const mk = (text: string): HumanComment => ({ id: 1, text, lang: 'en', ply: 1, san: 'e4', gameId: 'g', label: null, source: { kind: 'book', title: 'Book', author: null } })

beforeEach(() => {
  useAnalysisBoards.setState({ boards: [], active: null, scratch: null })
  useStudyBoardStore.getState().reset()
  useSettingsStore.setState({ language: 'en', showEval: false, analysisComments: false })
  vi.mocked(lookupPositionComments).mockReset()
  vi.mocked(lookupPositionComments).mockImplementation(async (fen) => (fen.includes('4P3') ? [mk('After e4 comment')] : []))
})

describe('analysis board: comments of each position', () => {
  it('is off by default and shows the comments of the position played when on', async () => {
    render(<AnalysisPage />)
    expect(screen.queryByTestId('position-comments')).toBeNull()
    fireEvent.click(screen.getByRole('checkbox', { name: 'Show the comments of each position' }))
    fireEvent.click(screen.getByText('play-e4'))
    expect(await screen.findByText('After e4 comment')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'First position' }))
    await vi.waitFor(() => expect(screen.queryByText('After e4 comment')).toBeNull())
    expect(useSettingsStore.getState().analysisComments).toBe(true)
  })

  it('also works on the current board (the study board) following the clicked move', async () => {
    useSettingsStore.setState({ analysisComments: true })
    const tree = recognizeGames('1. e4 e5 2. Nf3')[0].tree
    act(() => useStudyBoardStore.getState().loadPosition(tree, tree.mainline[1], false))
    render(<AnalysisPage />)
    expect(screen.getByTestId('study-board')).toBeInTheDocument()
    await vi.waitFor(() => expect(lookupPositionComments).toHaveBeenCalledWith(expect.stringContaining('rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w')))
    expect(screen.getByRole('checkbox', { name: 'Show the comments of each position' })).toBeChecked()
    // A click on a move of the list moves the position the comments follow.
    fireEvent.click(screen.getByRole('button', { name: 'Nf3' }))
    await vi.waitFor(() => expect(lookupPositionComments).toHaveBeenCalledWith(expect.stringContaining('5N2')))
  })
})
