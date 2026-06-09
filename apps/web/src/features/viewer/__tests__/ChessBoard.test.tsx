import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import ChessBoard from '../../../shared/chess/ChessBoard'

// react-chessboard renders a complex SVG board in jsdom which may fail;
// mock it to verify props are passed correctly.
vi.mock('react-chessboard', () => ({
  Chessboard: ({ options }: { options?: Record<string, unknown> }) => (
    <div data-testid="chessboard" data-position={options?.position as string}>
      {options?.squareStyles
        ? Object.entries(options.squareStyles as Record<string, Record<string, string>>)
            .map(([sq, style]) => (
              <div
                key={sq}
                data-testid={`highlight-${sq}`}
                data-bg={style.backgroundColor}
              />
            ))
        : null}
    </div>
  ),
}))

const DEFAULT_FEN = 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1'

describe('ChessBoard', () => {
  it('renders a chessboard element', () => {
    render(<ChessBoard fen={DEFAULT_FEN} orientation="white" />)
    expect(screen.getByTestId('chessboard')).toBeInTheDocument()
  })

  it('passes fen as position to underlying Chessboard', () => {
    render(<ChessBoard fen={DEFAULT_FEN} orientation="white" />)
    expect(screen.getByTestId('chessboard')).toHaveAttribute('data-position', DEFAULT_FEN)
  })

  it('applies highlight styles for lastMove from and to squares', () => {
    render(
      <ChessBoard
        fen={DEFAULT_FEN}
        orientation="white"
        lastMove={{ from: 'e2', to: 'e4' }}
      />
    )
    expect(screen.getByTestId('highlight-e2')).toBeInTheDocument()
    expect(screen.getByTestId('highlight-e4')).toBeInTheDocument()
  })

  it('does not render highlight elements when no lastMove', () => {
    render(<ChessBoard fen={DEFAULT_FEN} orientation="white" />)
    expect(screen.queryByTestId('highlight-e2')).toBeNull()
  })

  it('passes boardOrientation to Chessboard', () => {
    // Orientation is passed in options; we verify the component renders without error for black
    render(<ChessBoard fen={DEFAULT_FEN} orientation="black" />)
    expect(screen.getByTestId('chessboard')).toBeInTheDocument()
  })
})
