import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { recognizeGames } from '@chess-ebook/chess-shared'
import { StudyBoard } from './StudyBoard'
import { useStudyBoardStore } from '../store/studyBoardStore'
import { useSettingsStore } from '../../../shared/settings/settingsStore'

// Stockfish worker is not available in jsdom — stub the eval hook.
vi.mock('../../../shared/stockfish/useStockfishEval', () => ({
  useStockfishEval: () => ({ loading: false, scoreCp: 20, depth: 12 }),
}))

const tree = () => recognizeGames('1. e4 e5 2. Nf3 Nc6 3. Bb5 (3. Bc4 Bc5) a6')[0].tree

beforeEach(() => {
  useStudyBoardStore.getState().reset()
})

describe('StudyBoard', () => {
  it('renders the study board with navigation and toolbar', () => {
    render(<StudyBoard />)
    expect(screen.getByText('Study Board')).toBeInTheDocument()
    expect(screen.getByTitle('Next move')).toBeInTheDocument()
    expect(screen.getByTitle('Draw arrows')).toBeInTheDocument()
    expect(screen.getByTitle('Pen — freehand draw')).toBeInTheDocument()
    expect(screen.getByTitle('Flip board')).toBeInTheDocument()
  })

  it('advances the position when Next is clicked', () => {
    const t = tree()
    useStudyBoardStore.getState().loadPosition(t, t.mainline[0], false)
    render(<StudyBoard />)
    fireEvent.click(screen.getByTitle('Next move'))
    expect(useStudyBoardStore.getState().currentNodeId).toBe(t.mainline[1])
  })

  it('shows source-notation last-move text', () => {
    const t = tree()
    useStudyBoardStore.getState().loadPosition(t, t.mainline[2], false) // Nf3
    render(<StudyBoard />)
    expect(screen.getByText(/After 2\.Nf3/)).toBeInTheDocument()
  })

  it('opens the variation chooser at a branch point', () => {
    const t = tree()
    useStudyBoardStore.getState().loadPosition(t, t.mainline[3], false) // Nc6, branch ahead
    render(<StudyBoard />)
    fireEvent.click(screen.getByTitle('Next move'))
    expect(screen.getByRole('menu', { name: /choose continuation/i })).toBeInTheDocument()
    expect(screen.getByText('Mainline')).toBeInTheDocument()
  })

  it('activates the pen tool', () => {
    render(<StudyBoard />)
    fireEvent.click(screen.getByTitle('Pen — freehand draw'))
    expect(useStudyBoardStore.getState().toolMode).toBe('pen')
  })

  it('renders the vertical eval bar layout when configured', () => {
    useSettingsStore.setState({ evalBarDirection: 'vertical' })
    const { container } = render(<StudyBoard />)
    // vertical bar uses w-2 self-stretch
    expect(container.querySelector('.self-stretch')).toBeTruthy()
  })
})
