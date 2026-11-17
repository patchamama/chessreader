import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import PlayPage from './PlayPage'
import { usePlayStore, setPlayRuntime } from './playStore'
import { useSettingsStore } from '../../shared/settings/settingsStore'

vi.mock('../../shared/chess/ChessBoard', () => ({
  default: ({ fen, onSquareClick }: { fen: string; onSquareClick?: (s: string) => void }) => (
    <div data-testid="board">{fen}{['e2', 'e4'].map((s) => <button key={s} onClick={() => onSquareClick?.(s)}>sq-{s}</button>)}</div>
  ),
}))

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
  it('a move can be made by clicking the piece and then its square', async () => {
    render(<PlayPage />)
    fireEvent.click(screen.getByRole('button', { name: 'New game' }))
    fireEvent.click(screen.getByRole('button', { name: 'sq-e2' }))
    fireEvent.click(screen.getByRole('button', { name: 'sq-e4' }))
    expect(usePlayStore.getState().sans[0]).toBe('e4')
  })
  it('Lichess needs a token with board:play and shows where to create it', () => {
    render(<PlayPage />)
    fireEvent.change(screen.getByLabelText('Opponent'), { target: { value: 'lichess' } })
    expect((screen.getByRole('button', { name: 'New game' }) as HTMLButtonElement).disabled).toBe(true)
    expect(screen.getByRole('link', { name: /Create a token/ }).getAttribute('href')).toContain('board:play')
  })
  it('a Lichess game can be played at the chosen clock', () => {
    useSettingsStore.setState({ lichessPlayToken: 'tok' })
    const start = vi.spyOn(usePlayStore.getState(), 'start').mockImplementation(() => {})
    render(<PlayPage />)
    fireEvent.change(screen.getByLabelText('Opponent'), { target: { value: 'lichess' } })
    fireEvent.change(screen.getByLabelText('Clock'), { target: { value: '15+10' } })
    fireEvent.click(screen.getByRole('button', { name: 'New game' }))
    expect(start).toHaveBeenCalledWith(expect.objectContaining({ mode: 'lichess', token: 'tok', clock: { minutes: 15, increment: 10 } }))
    start.mockRestore()
  })
  it('the Lichess AI: level and colour, same token', () => {
    useSettingsStore.setState({ lichessPlayToken: 'tok' })
    const start = vi.spyOn(usePlayStore.getState(), 'start').mockImplementation(() => {})
    render(<PlayPage />)
    fireEvent.change(screen.getByLabelText('Opponent'), { target: { value: 'lichess-ai' } })
    fireEvent.change(screen.getByLabelText('I play'), { target: { value: 'black' } })
    fireEvent.change(screen.getByLabelText('Engine strength'), { target: { value: '5' } })
    fireEvent.click(screen.getByRole('button', { name: 'New game' }))
    expect(start).toHaveBeenCalledWith(expect.objectContaining({ mode: 'lichess-ai', color: 'black', strength: 5, token: 'tok', clock: { minutes: 10, increment: 5 } }))
    start.mockRestore()
  })
})
