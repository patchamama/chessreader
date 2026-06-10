import { Chessboard } from 'react-chessboard'
import type { CSSProperties } from 'react'
import { useSettingsStore, BOARD_THEMES } from '../settings/settingsStore'

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
  const boardTheme = useSettingsStore((s) => s.boardTheme)
  const theme = BOARD_THEMES[boardTheme]

  const squareStyles: Record<string, CSSProperties> = {}
  if (lastMove) {
    squareStyles[lastMove.from] = HIGHLIGHT_STYLE
    squareStyles[lastMove.to]   = HIGHLIGHT_STYLE
  }

  return (
    <Chessboard
      options={{
        position: fen,
        boardOrientation: orientation,
        squareStyles,
        allowDragging: false,
        showAnimations: false,
        lightSquareStyle: { backgroundColor: theme.light },
        darkSquareStyle:  { backgroundColor: theme.dark },
      }}
    />
  )
}
