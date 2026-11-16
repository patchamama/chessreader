import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { recognizeGames } from '@chess-ebook/chess-shared'
import { CorrectionWorkbench } from './CorrectionWorkbench'
import { useStudyBoardStore } from '../store/studyBoardStore'
import { useSettingsStore } from '../../../shared/settings/settingsStore'
import { useExternalBookStore } from '../../../shared/externalBook/externalBookStore'

// OCR dropped Black's third move.
const TEXT = '1. e4 e5 2. Nf3 Nc6 3. Bb5 4. Ba4 Nf6 5. O-O Be7'
const games = recognizeGames(TEXT, { algorithm: 2 })

function open() {
  render(
    <MemoryRouter initialEntries={['/x']}>
      <Routes>
        <Route path="/x" element={<CorrectionWorkbench games={games} text={TEXT} />} />
        <Route path="/read/-1" element={<p>reader</p>} />
      </Routes>
    </MemoryRouter>,
  )
  fireEvent.click(screen.getByRole('button', { name: /Correct this game/ }))
}

beforeEach(() => {
  useStudyBoardStore.getState().reset()
  useSettingsStore.setState({ language: 'en' })
})

describe('CorrectionWorkbench', () => {
  it('shows where the game stops fitting', () => {
    open()
    fireEvent.click(screen.getByRole('button', { name: 'Check to the end' }))
    expect(screen.getByTestId('check-result')).toHaveTextContent('3... Ba4 does not fit here')
  })

  it('a missing move can be inserted, checked to the end and opened as corrected text', () => {
    open()
    fireEvent.click(screen.getByRole('button', { name: 'Insert a move after 3.' }))
    fireEvent.change(screen.getByLabelText('Move 3...'), { target: { value: 'a6' } })
    fireEvent.click(screen.getByRole('button', { name: 'Check to the end' }))
    expect(screen.getByTestId('check-result')).toHaveTextContent('All moves are legal up to the end')
    expect(screen.getByTestId('correction-list')).toHaveTextContent('insert a6')
    fireEvent.click(screen.getByRole('button', { name: 'Open corrected text in the reader' }))
    expect(screen.getByText('reader')).toBeInTheDocument()
    expect(useExternalBookStore.getState().chapters[0].html).toContain('3. Bb5 a6 4. Ba4 Nf6')
  })

  it('checks only up to the chosen move', () => {
    open()
    fireEvent.change(screen.getByLabelText('Check up to move'), { target: { value: '2' } })
    fireEvent.click(screen.getByRole('button', { name: '✓' }))
    expect(screen.getByTestId('check-result')).toHaveTextContent('All moves are legal up to 2... Nc6')
  })
})
