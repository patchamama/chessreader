import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import PlayPage from './PlayPage'
import { usePlayStore, setPlayRuntime } from './playStore'
import { useSettingsStore } from '../../shared/settings/settingsStore'

vi.mock('../../shared/chess/ChessBoard', () => ({ default: ({ fen }: { fen: string }) => <div data-testid="board">{fen}</div> }))

beforeEach(() => {
  useSettingsStore.setState({ language: 'en' })
  setPlayRuntime({ analyse: vi.fn(async () => [{ idx: 1, pv: ['e7e5'], scoreCp: 0, depth: 1 }]) as never })
  usePlayStore.getState().reset()
})

describe('PlayPage', () => {
  it('starts a game against the engine at the chosen strength', () => {
    render(<PlayPage />)
    fireEvent.change(screen.getByLabelText('Engine strength'), { target: { value: '6' } })
    fireEvent.click(screen.getByRole('button', { name: 'New game' }))
    expect(usePlayStore.getState()).toMatchObject({ status: 'playing', strength: 6, mode: 'engine' })
  })
  it('Lichess needs a token with board:play and shows where to create it', () => {
    render(<PlayPage />)
    fireEvent.change(screen.getByLabelText('Opponent'), { target: { value: 'lichess' } })
    expect((screen.getByRole('button', { name: 'New game' }) as HTMLButtonElement).disabled).toBe(true)
    expect(screen.getByRole('link', { name: /Create a token/ }).getAttribute('href')).toContain('board:play')
  })
})
