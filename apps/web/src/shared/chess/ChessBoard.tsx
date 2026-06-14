import { Chessboard } from 'react-chessboard'
import type { Arrow } from 'react-chessboard'
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
  /** Drawn arrows (controlled). */
  arrows?: Arrow[]
  /** Allow the user to drag-draw arrows on the board. */
  allowDrawingArrows?: boolean
  /** Fired when the user adds/removes an arrow. */
  onArrowsChange?: (arrows: Arrow[]) => void
  /** Extra square styles (e.g. annotation highlights), merged AFTER lastMove. */
  customSquareStyles?: Record<string, CSSProperties>
  /** Fired when a square is clicked (used by highlight/eraser tools). */
  onSquareClick?: (square: string) => void
}

const HIGHLIGHT_STYLE: CSSProperties = {
  backgroundColor: 'rgba(255, 214, 10, 0.5)',
}

export default function ChessBoard({
  fen,
  orientation,
  lastMove,
  arrows,
  allowDrawingArrows,
  onArrowsChange,
  customSquareStyles,
  onSquareClick,
}: ChessBoardProps) {
  const boardTheme = useSettingsStore((s) => s.boardTheme)
  const theme = BOARD_THEMES[boardTheme]

  const squareStyles: Record<string, CSSProperties> = {}
  if (lastMove) {
    squareStyles[lastMove.from] = HIGHLIGHT_STYLE
    squareStyles[lastMove.to]   = HIGHLIGHT_STYLE
  }
  if (customSquareStyles) {
    for (const [sq, style] of Object.entries(customSquareStyles)) {
      squareStyles[sq] = { ...squareStyles[sq], ...style }
    }
  }

  return (
    <Chessboard
      options={{
        position: fen,
        boardOrientation: orientation,
        squareStyles,
        allowDragging: false,
        showAnimations: false,
        allowDrawingArrows: allowDrawingArrows ?? false,
        ...(arrows ? { arrows } : {}),
        ...(onArrowsChange ? { onArrowsChange: ({ arrows }) => onArrowsChange(arrows) } : {}),
        ...(onSquareClick ? { onSquareClick: ({ square }) => onSquareClick(square) } : {}),
        lightSquareStyle: { backgroundColor: theme.light },
        darkSquareStyle:  { backgroundColor: theme.dark },
      }}
    />
  )
}
