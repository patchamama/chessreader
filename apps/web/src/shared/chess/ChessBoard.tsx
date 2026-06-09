import { Chessboard } from 'react-chessboard'
import type { CSSProperties } from 'react'

export interface LastMove {
  from: string
  to: string
}

interface ChessBoardProps {
  fen: string
  orientation: 'white' | 'black'
  lastMove?: LastMove | null
}

const HIGHLIGHT_STYLE: CSSProperties = {
  backgroundColor: 'rgba(255, 214, 10, 0.5)',
}

export default function ChessBoard({ fen, orientation, lastMove }: ChessBoardProps) {
  const squareStyles: Record<string, CSSProperties> = {}
  if (lastMove) {
    squareStyles[lastMove.from] = HIGHLIGHT_STYLE
    squareStyles[lastMove.to] = HIGHLIGHT_STYLE
  }

  return (
    <Chessboard
      options={{
        position: fen,
        boardOrientation: orientation,
        squareStyles,
        allowDragging: false,
        showAnimations: false,
      }}
    />
  )
}
