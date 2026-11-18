import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { LinePlayer } from './LinePlayer'
import { useSettingsStore } from '../settings/settingsStore'

vi.mock('./ChessBoard', () => ({
  default: ({ fen }: { fen: string }) => <div data-testid="board">{fen}</div>,
}))

const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'
const AFTER_E4 = 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1'
const AFTER_E5 = 'rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2'
const AFTER_NF3 = 'rnbqkbnr/pppp1ppp/8/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R b KQkq - 1 2'

const board = () => screen.getByTestId('line-player-board')

beforeEach(() => useSettingsStore.setState({ language: 'en', diagramEvalThumbs: true }))
afterEach(() => vi.useRealTimers())

describe('LinePlayer (S5)', () => {
  it('writes the line with thumbnails on hover, and the replay buttons step through its positions', () => {
    render(<LinePlayer fen={START} moves={['e4', 'e5', 'Nf3']} />)
    const moves = document.querySelectorAll('[data-testid="line-player-moves"] [data-move-thumb]')
    expect(screen.getByTestId('line-player-moves')).toHaveTextContent('1. e4 e5 2. Nf3')
    expect([...moves].map((m) => m.textContent)).toEqual(['e4', 'e5', 'Nf3'])
    fireEvent.mouseEnter(moves[1])
    expect(screen.getAllByTestId('board').map((b) => b.textContent)).toContain(AFTER_E5)
    fireEvent.mouseLeave(moves[1])

    expect(board()).toHaveTextContent(START)
    fireEvent.click(screen.getByRole('button', { name: 'Next move' }))
    expect(board()).toHaveTextContent(AFTER_E4)
    fireEvent.click(screen.getByRole('button', { name: 'Last move' }))
    expect(board()).toHaveTextContent(AFTER_NF3)
    fireEvent.click(screen.getByRole('button', { name: 'Previous move' }))
    expect(board()).toHaveTextContent(AFTER_E5)
    fireEvent.click(screen.getByRole('button', { name: 'First position' }))
    expect(board()).toHaveTextContent(START)
    fireEvent.click(moves[2])
    expect(board()).toHaveTextContent(AFTER_NF3)
  })

  it('plays the line by itself, one move a second, and pauses', () => {
    vi.useFakeTimers()
    render(<LinePlayer fen={START} moves={['e2e4', 'e7e5']} />)
    fireEvent.click(screen.getByRole('button', { name: 'Play' }))
    act(() => { vi.advanceTimersByTime(1000) })
    expect(board()).toHaveTextContent(AFTER_E4)
    fireEvent.click(screen.getByRole('button', { name: 'Pause' }))
    act(() => { vi.advanceTimersByTime(3000) })
    expect(board()).toHaveTextContent(AFTER_E4)
  })

  it('writes UCI moves as SAN, with the piece letters of the language', () => {
    useSettingsStore.setState({ language: 'es' })
    render(<LinePlayer fen={START} moves={['e2e4', 'e7e5', 'g1f3']} />)
    expect(screen.getByTestId('line-player-moves')).toHaveTextContent('1. e4 e5 2. Cf3')
    expect(screen.getByRole('button', { name: 'Siguiente jugada' })).toBeInTheDocument()
  })

  it('an illegal line is written as plain text, without a board and without failing', () => {
    render(<LinePlayer fen={START} moves={['e4', 'Ke5']} />)
    expect(screen.getByTestId('line-player-text')).toHaveTextContent('e4 Ke5')
    expect(screen.queryByTestId('line-player-board')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Next move' })).toBeNull()
  })

  it('an invalid start position is written as plain text too', () => {
    render(<LinePlayer fen="not a fen" moves={['e4']} />)
    expect(screen.getByTestId('line-player-text')).toHaveTextContent('e4')
  })

  it('can start closed, showing the board only when asked to replay', () => {
    render(<LinePlayer fen={START} moves={['e4']} initiallyOpen={false} />)
    expect(screen.queryByTestId('line-player-board')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Replay the line' }))
    expect(board()).toHaveTextContent(START)
  })
})
