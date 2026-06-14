import type { GameNode } from '@chess-ebook/chess-shared'

/** Side to move derived from the FEN active-color field. */
function sideToMove(fen: string): 'white' | 'black' {
  return fen.split(' ')[1] === 'b' ? 'black' : 'white'
}

interface MoveStatusRowProps {
  fen: string
  node: GameNode | null
}

/**
 * Status line shown below the board: the last-move text ("After 31.Dc8") is
 * CENTERED, and a single turn icon (whose move is next) sits at the RIGHT.
 */
export function MoveStatusRow({ fen, node }: MoveStatusRowProps) {
  const side = sideToMove(fen)
  const label = node
    ? `After ${node.moveNumber}${node.color === 'white' ? '.' : '...'}${node.rawSan ?? node.san}`
    : `${side === 'white' ? 'White' : 'Black'} to move`

  return (
    <div className="relative flex items-center justify-center text-xs text-slate-500">
      <span className="font-medium text-slate-600">{label}</span>
      <span
        title={`${side === 'white' ? 'White' : 'Black'} to move`}
        aria-label={`${side} to move`}
        className={`absolute right-0 h-4 w-4 rounded-full border-2 shadow-sm ${
          side === 'white' ? 'border-slate-400 bg-white' : 'border-slate-600 bg-slate-900'
        }`}
      />
    </div>
  )
}
