import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { StudyBoard } from '../StudyBoard'
import { useStudyBoardStore } from '../../store/studyBoardStore'
import { useSettingsStore } from '../../../../shared/settings/settingsStore'

vi.mock('../../../../shared/stockfish/useStockfishEval', () => ({
  useStockfishEval: () => ({ loading: false, scoreCp: 20, depth: 12 }),
}))

beforeEach(() => {
  useStudyBoardStore.getState().reset()
  useSettingsStore.setState({ notationStyle: 'letters', showEval: false })
})

describe('StudyBoard notation toggle (S12)', () => {
  it('switches every notation between figurines and the letters of the language', () => {
    render(<StudyBoard />)
    fireEvent.click(screen.getByRole('button', { name: 'Show pieces as figurines' }))
    expect(useSettingsStore.getState().notationStyle).toBe('figurine')
    fireEvent.click(screen.getByRole('button', { name: 'Show pieces as letters' }))
    expect(useSettingsStore.getState().notationStyle).toBe('letters')
  })
})
