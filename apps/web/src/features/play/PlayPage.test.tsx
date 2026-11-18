import { describe, it, expect, vi, beforeEach } from 'vitest'
import { act, render, screen, fireEvent } from '@testing-library/react'
import PlayPage from './PlayPage'
import { usePlayStore, setPlayRuntime } from './playStore'
import { useSettingsStore } from '../../shared/settings/settingsStore'

vi.mock('./humanMoves', () => ({ humanMoves: vi.fn(async () => ({ rating: 1500, moves: [{ san: 'e4', probability: 0.41 }, { san: 'd4', probability: 0.32 }] })) }))
vi.mock('../viewer/components/EvalBar', () => ({ default: () => <div data-testid="evalbar" /> }))
vi.mock('../library/review/useMoveHints', () => ({ useMoveHints: () => ({}) }))

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
    useSettingsStore.setState({ lichessToken: 'tok' })
    const start = vi.spyOn(usePlayStore.getState(), 'start').mockImplementation(() => {})
    render(<PlayPage />)
    fireEvent.change(screen.getByLabelText('Opponent'), { target: { value: 'lichess' } })
    fireEvent.change(screen.getByLabelText('Clock'), { target: { value: '15+10' } })
    fireEvent.click(screen.getByRole('button', { name: 'New game' }))
    expect(start).toHaveBeenCalledWith(expect.objectContaining({ mode: 'lichess', token: 'tok', clock: { minutes: 15, increment: 10 } }))
    start.mockRestore()
  })
  it('the Lichess AI: level and colour, same token', () => {
    useSettingsStore.setState({ lichessToken: 'tok' })
    const start = vi.spyOn(usePlayStore.getState(), 'start').mockImplementation(() => {})
    render(<PlayPage />)
    fireEvent.change(screen.getByLabelText('Opponent'), { target: { value: 'lichess-ai' } })
    fireEvent.change(screen.getByLabelText('I play'), { target: { value: 'black' } })
    fireEvent.change(screen.getByLabelText('Engine strength'), { target: { value: '5' } })
    fireEvent.click(screen.getByRole('button', { name: 'New game' }))
    expect(start).toHaveBeenCalledWith(expect.objectContaining({ mode: 'lichess-ai', color: 'black', strength: 5, token: 'tok', clock: { minutes: 10, increment: 5 } }))
    start.mockRestore()
  })

  it('options: hint colours, move status, eval bar, legend and voice can be switched (S11–S13)', () => {
    render(<PlayPage />)
    fireEvent.click(screen.getByLabelText('Colour the moves of the selected piece'))
    fireEvent.click(screen.getByLabelText('Say how good each move is'))
    fireEvent.click(screen.getByLabelText('Evaluation bar'))
    fireEvent.click(screen.getByLabelText('Legend of the colours'))
    fireEvent.change(screen.getByLabelText('Say the moves aloud'), { target: { value: 'both' } })
    expect(useSettingsStore.getState()).toMatchObject({ playMoveHints: false, playMoveStatus: false, playEvalBar: true, playLegend: false, playVoice: 'both' })
    useSettingsStore.getState().reset()
  })
  it('shows the legend of the colours during the first 5 moves (S11)', () => {
    useSettingsStore.setState({ playMoveHints: true, playLegend: true })
    render(<PlayPage />)
    fireEvent.click(screen.getByRole('button', { name: 'New game' }))
    const legend = screen.getByRole('list', { name: 'Colours' })
    expect(legend).toHaveTextContent('Best')
    expect(legend).toHaveTextContent('Blunder')
    act(() => usePlayStore.setState({ sans: Array(10).fill('e4') }))
    expect(screen.queryByRole('list', { name: 'Colours' })).toBeNull()
  })
  it('says how the last move was judged (S12)', () => {
    render(<PlayPage />)
    act(() => usePlayStore.setState({ status: 'playing', judgement: { ply: 1, san: 'e4', kind: 'book', loss: 0, opening: "King's Pawn Game (B00)" } }))
    expect(screen.getByTestId('move-status')).toHaveTextContent("e4: book move · King's Pawn Game (B00)")
    act(() => usePlayStore.setState({ judgement: { ply: 3, san: 'Qg4', kind: 'blunder', loss: 41.5 } }))
    expect(screen.getByTestId('move-status')).toHaveTextContent('Qg4: blunder (−41.5%)')
  })
  it('shows the players with ratings and the clocks of a Lichess game (S13)', () => {
    render(<PlayPage />)
    act(() => usePlayStore.setState({
      status: 'playing', mode: 'lichess-ai', color: 'white',
      players: { white: { name: 'Mandy', rating: 1650 }, black: { name: 'Lichess AI level 3' } },
      clocks: { white: 600000, black: 125000, increment: 5000, at: Date.now(), running: null },
      gameInfo: { speed: 'rapid', rated: false, url: 'https://lichess.org/g2' },
    }))
    expect(screen.getByTestId('player-white')).toHaveTextContent('Mandy (1650)')
    expect(screen.getByTestId('player-white')).toHaveTextContent('10:00')
    expect(screen.getByTestId('player-black')).toHaveTextContent('Lichess AI level 3')
    expect(screen.getByTestId('player-black')).toHaveTextContent('2:05')
    expect(screen.getByRole('link', { name: /rapid · casual/ })).toHaveAttribute('href', 'https://lichess.org/g2')
  })
  it('offers the Maia bots of Lichess as human-like opponents (S13)', () => {
    useSettingsStore.setState({ lichessToken: 'tok' })
    const start = vi.spyOn(usePlayStore.getState(), 'start').mockImplementation(() => {})
    render(<PlayPage />)
    fireEvent.change(screen.getByLabelText('Opponent'), { target: { value: 'lichess-bot' } })
    fireEvent.change(screen.getByLabelText('Bot'), { target: { value: 'maia9' } })
    fireEvent.click(screen.getByRole('button', { name: 'New game' }))
    expect(start).toHaveBeenCalledWith(expect.objectContaining({ mode: 'lichess-bot', bot: 'maia9', token: 'tok' }))
    start.mockRestore()
  })

  it('on my turn, says what a player of my rating would play (Maia, S7)', async () => {
    useSettingsStore.setState({ playHumanHint: true, playHumanRating: 1500 })
    render(<PlayPage />)
    fireEvent.click(screen.getByRole('button', { name: 'New game' }))
    expect(await screen.findByTestId('human-moves')).toHaveTextContent('A 1500 player would play: e4 (41%), d4 (32%)')
    useSettingsStore.setState({ playHumanHint: false })
  })
})
