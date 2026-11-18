import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { PuzzlePanel } from './PuzzlePanel'

vi.mock('../../shared/chess/ChessBoard', () => ({
  default: ({ fen, onPieceDrop }: { fen: string; onPieceDrop?: (f: string, t: string) => boolean }) => (
    <div data-testid="board">
      {fen}
      <button onClick={() => onPieceDrop?.('a1', 'a8')}>drop-a1a8</button>
      <button onClick={() => onPieceDrop?.('a1', 'a2')}>drop-a1a2</button>
    </div>
  ),
}))

// White to move mates with Ra8 (a mate in one).
const DAILY = {
  game: { id: 'g1', perf: { name: 'Blitz' }, players: [{ name: 'Ann', color: 'white', rating: 2000 }, { name: 'Bob', color: 'black', rating: 1900 }] },
  puzzle: { id: 'p1', rating: 1500, plays: 10, solution: ['a1a8'], themes: ['mateIn1', 'backRankMate'], fen: '6k1/5ppp/8/8/8/8/5PPP/R5K1 w - - 0 1', lastMove: 'g7g8', initialPly: 30 },
}

beforeEach(() => vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(DAILY), { status: 200 }))))
afterEach(() => vi.unstubAllGlobals())

describe('PuzzlePanel', () => {
  it('loads the puzzle of the day with its rating, themes and the side to play (S1)', async () => {
    render(<PuzzlePanel />)
    fireEvent.click(screen.getByRole('button', { name: 'Puzzle of the day' }))
    await waitFor(() => expect(screen.getByText(/Rating 1500/)).toBeInTheDocument())
    expect(screen.getByText(/mateIn1, backRankMate/)).toBeInTheDocument()
    expect(screen.getByText('White to play')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Ann \(2000\) – Bob \(1900\)/ })).toHaveAttribute('href', 'https://lichess.org/g1#30')
  })

  it('says when a move is wrong, and solved when it is right', async () => {
    render(<PuzzlePanel />)
    fireEvent.click(screen.getByRole('button', { name: 'Puzzle of the day' }))
    await waitFor(() => screen.getByText(/Rating 1500/))
    fireEvent.click(screen.getByText('drop-a1a2'))
    expect(screen.getByRole('status')).toHaveTextContent('Not the move. Try again.')
    fireEvent.click(screen.getByText('drop-a1a8'))
    expect(screen.getByRole('status')).toHaveTextContent('Solved!')
  })

  it('shows the solution on request', async () => {
    render(<PuzzlePanel />)
    fireEvent.click(screen.getByRole('button', { name: 'Puzzle of the day' }))
    await waitFor(() => screen.getByText(/Rating 1500/))
    fireEvent.click(screen.getByRole('button', { name: 'Show the solution' }))
    expect(screen.getByTestId('puzzle-solution')).toHaveTextContent('Solution: 1. Ra8#')
  })

  it('the solution can be replayed on a small board, with a thumbnail for each move (S5)', async () => {
    render(<PuzzlePanel />)
    fireEvent.click(screen.getByRole('button', { name: 'Puzzle of the day' }))
    await waitFor(() => screen.getByText(/Rating 1500/))
    fireEvent.click(screen.getByRole('button', { name: 'Show the solution' }))
    expect(screen.getByTestId('puzzle-solution-player-moves')).toHaveTextContent('1. Ra8#')
    fireEvent.click(screen.getByRole('button', { name: 'Next move' }))
    expect(screen.getByTestId('puzzle-solution-player-board')).toHaveTextContent('R5k1/5ppp/8/8/8/8/5PPP/6K1 b - - 1 1')
  })

  it('explains the themes of the puzzle in an info section (S6)', async () => {
    render(<PuzzlePanel />)
    fireEvent.click(screen.getByRole('button', { name: 'Puzzle of the day' }))
    await waitFor(() => screen.getByText(/Rating 1500/))
    fireEvent.click(screen.getByText(/About this puzzle/))
    expect(screen.getByText('Back-rank mate')).toBeInTheDocument()
    expect(screen.getByText(/trapped behind its own pawns/)).toBeInTheDocument()
  })

  it('explains the pattern chosen in the pattern trainer (S6)', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => new Response(JSON.stringify(
      String(url).endsWith('patterns/index.json') ? { themes: [{ theme: 'fork', en: 'Fork', es: 'Ataque doble', count: 3 }] } : DAILY,
    ), { status: 200 })))
    render(<PuzzlePanel />)
    await waitFor(() => screen.getByLabelText('Pattern'))
    fireEvent.click(screen.getByText(/About this pattern/))
    expect(screen.getByText(/attacks two or more enemy pieces/)).toBeInTheDocument()
  })
})
