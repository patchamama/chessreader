import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { recognizeGames } from '@chess-ebook/chess-shared'

vi.mock('../../api/trainerApi', () => ({
  addTrainerLine: vi.fn(),
  listTrainerLines: vi.fn(),
  reviewTrainerLine: vi.fn(),
  deleteTrainerLine: vi.fn(),
}))
vi.mock('react-chessboard', () => ({ Chessboard: () => <div data-testid="chessboard" /> }))
vi.mock('../../../../shared/stockfish/useStockfishEval', () => ({
  useStockfishEval: () => ({ loading: false, scoreCp: 0, depth: 10 }),
}))

import { StudyTools } from '../ReaderToolbar'
import { StudyBoard } from '../StudyBoard'
import { useStudyBoardStore } from '../../store/studyBoardStore'
import { usePracticeStore } from '../../store/practiceStore'
import { useStudyToolsStore } from '../../store/studyToolsStore'
import { addTrainerLine, listTrainerLines } from '../../api/trainerApi'

// study-tools-round T2 / S7: "+ Trainer", "Guess the Move" and "Trainer" move
// from the study board header to icons in the reader's top bar.

const tree = () => recognizeGames('1. e4 e5 2. Nf3 Nc6 3. Bb5 a6')[0].tree

const LINE = {
  id: 1, bookId: null, name: 'Italian Game',
  startFen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
  movesUci: ['e2e4', 'e7e5', 'g1f3'], orientation: 'white' as const,
  ease: 2.5, intervalDays: 0, reps: 0, lapses: 0,
  dueAt: '2026-06-15T12:00:00+00:00', lastReviewedAt: null, createdAt: '2026-06-15T12:00:00+00:00',
}

beforeEach(() => {
  vi.mocked(addTrainerLine).mockReset()
  vi.mocked(listTrainerLines).mockReset()
  vi.mocked(listTrainerLines).mockResolvedValue([LINE])
  useStudyBoardStore.getState().reset()
  usePracticeStore.getState().stop()
  useStudyToolsStore.setState({ trainerOpen: false })
})

function withGame() {
  const t = tree()
  useStudyBoardStore.getState().loadPosition(t, t.mainline[1], false) // after 1... e5
  return t
}

describe('study tools in the top bar (S7)', () => {
  it('shows three labelled icons; save and guess need an open game', () => {
    render(<StudyTools />)
    const save = screen.getByRole('button', { name: 'Save the line from this move to the trainer' })
    const guess = screen.getByRole('button', { name: 'Guess the next moves' })
    const trainer = screen.getByRole('button', { name: 'Open the position trainer' })
    expect(save).toBeDisabled()
    expect(guess).toBeDisabled()
    expect(trainer).toBeEnabled()
    for (const b of [save, guess, trainer]) expect(b.title).toBe(b.getAttribute('aria-label'))
  })

  it('saves the rest of the main line from the current move and says so', async () => {
    withGame()
    vi.mocked(addTrainerLine).mockResolvedValue(LINE)
    render(<StudyTools />)
    fireEvent.click(screen.getByRole('button', { name: 'Save the line from this move to the trainer' }))
    expect(await screen.findByRole('button', { name: 'Line saved to the trainer' })).toBeInTheDocument()
    const draft = vi.mocked(addTrainerLine).mock.calls[0][0]
    expect(draft.movesUci).toEqual(['g1f3', 'b8c6', 'f1b5', 'a7a6'])
  })

  it('tells the reader when the line could not be saved', async () => {
    withGame()
    vi.mocked(addTrainerLine).mockRejectedValue(new Error('401'))
    render(<StudyTools />)
    fireEvent.click(screen.getByRole('button', { name: 'Save the line from this move to the trainer' }))
    expect(await screen.findByRole('button', { name: /could not save the line/i })).toBeInTheDocument()
  })

  it('guess the move starts from the current move, shows it is on, and stops on a second click', () => {
    const t = withGame()
    const onOpen = vi.fn()
    render(<StudyTools onOpen={onOpen} />)
    fireEvent.click(screen.getByRole('button', { name: 'Guess the next moves' }))
    expect(usePracticeStore.getState().active).toBe(true)
    expect(usePracticeStore.getState().currentNodeId).toBe(t.mainline[1])
    expect(onOpen).toHaveBeenCalled()
    const stop = screen.getByRole('button', { name: 'Stop guessing the moves' })
    expect(stop.getAttribute('aria-pressed')).toBe('true')
    fireEvent.click(stop)
    expect(usePracticeStore.getState().active).toBe(false)
  })

  it('the trainer icon opens and closes the position trainer', () => {
    render(<StudyTools />)
    fireEvent.click(screen.getByRole('button', { name: 'Open the position trainer' }))
    expect(useStudyToolsStore.getState().trainerOpen).toBe(true)
    const close = screen.getByRole('button', { name: 'Close the position trainer' })
    expect(close.getAttribute('aria-pressed')).toBe('true')
    fireEvent.click(close)
    expect(useStudyToolsStore.getState().trainerOpen).toBe(false)
  })
})

describe('the study board gives that space to the board (S7)', () => {
  it('has no "Study Board" label and no trainer buttons of its own', () => {
    withGame()
    render(<StudyBoard />)
    expect(screen.queryByText(/^study board$/i)).toBeNull()
    expect(screen.queryByRole('button', { name: /\+ trainer|guess the move|^trainer$/i })).toBeNull()
    expect(screen.getByTitle('Next move')).toBeInTheDocument()
  })

  it('shows the position trainer instead of the board while it is open', async () => {
    useStudyToolsStore.setState({ trainerOpen: true })
    render(<StudyBoard />)
    expect(await screen.findByText('Italian Game')).toBeInTheDocument()
    expect(screen.queryByTitle('Next move')).toBeNull()
  })

  it('a trainer review stays in the trainer until it is graded (it used to vanish)', async () => {
    useStudyToolsStore.setState({ trainerOpen: true })
    render(<StudyBoard />)
    await screen.findByText('Italian Game')
    fireEvent.click(screen.getByRole('button', { name: /review/i }))
    expect(usePracticeStore.getState().active).toBe(true)
    usePracticeStore.setState({ status: 'finished' })
    expect(await screen.findByRole('button', { name: 'Good' })).toBeInTheDocument()
  })

  it('shows guess the move instead of the board while guessing', () => {
    const t = withGame()
    usePracticeStore.getState().start(t, t.mainline[1])
    render(<StudyBoard />)
    expect(screen.getByText(/find the move for white/i)).toBeInTheDocument()
    expect(screen.queryByTitle('Next move')).toBeNull()
  })

  it('the trainer explains how to add lines and when it cannot load them', async () => {
    vi.mocked(listTrainerLines).mockRejectedValueOnce(new Error('401'))
    useStudyToolsStore.setState({ trainerOpen: true })
    render(<StudyBoard />)
    await waitFor(() => expect(screen.getByText(/could not load your trainer lines/i)).toBeInTheDocument())
  })
})
