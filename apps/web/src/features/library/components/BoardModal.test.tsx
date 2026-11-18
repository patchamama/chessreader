import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { recognizeGames } from '@chess-ebook/chess-shared'
import { BoardModal, stepBack } from './BoardModal'
import { useStudyBoardStore } from '../store/studyBoardStore'
import { useSettingsStore } from '../../../shared/settings/settingsStore'

vi.mock('../../../shared/chess/ChessBoard', () => ({ default: ({ fen }: { fen: string }) => <div data-testid="board">{fen}</div> }))
vi.mock('../../viewer/components/EvalBar', () => ({ default: () => <div data-testid="evalbar" /> }))

const [g] = recognizeGames('1. e4 e5 2. Nf3 Nc6', { algorithm: 2 })

beforeEach(() => {
  useSettingsStore.getState().reset()
  useStudyBoardStore.getState().reset()
  useStudyBoardStore.getState().loadPosition(g.tree, g.tree.mainline[0], false)
})

describe('full-screen board (S10)', () => {
  it('shows the board, the moves as links and moves with the arrows; Esc closes', () => {
    const onClose = vi.fn()
    render(<BoardModal onClose={onClose} />)
    expect(screen.getByRole('dialog', { name: 'Board' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Nc6' }))
    expect(useStudyBoardStore.getState().currentNodeId).toBe(g.tree.mainline[3])
    fireEvent.keyDown(window, { key: 'ArrowLeft' })
    expect(useStudyBoardStore.getState().currentNodeId).toBe(g.tree.mainline[2])
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(onClose).toHaveBeenCalled()
  })

  it('going back N seconds of narration steps back over the steps said in that time', () => {
    const script = [{ speech: 'uno' }, { speech: 'dos tres cuatro cinco seis siete ocho nueve diez once doce trece catorce quince dieciséis' }, { speech: 'diecisiete' }]
    expect(stepBack(script, 2, 5)).toBe(1)
    expect(stepBack(script, 2, 10)).toBe(0)
  })
})
