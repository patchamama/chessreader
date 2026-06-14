import type { GameNode } from '@chess-ebook/chess-shared'

/** Side to move derived from the FEN active-color field. */
function sideToMove(fen: string): 'white' | 'black' {
  return fen.split(' ')[1] === 'b' ? 'black' : 'white'
}

interface TurnBadgeProps {
  fen: string
}

/** Small circular badge (white/black fill) showing whose move is next.
 *  Positioned absolute bottom-right of the board wrapper by the caller. */
export function TurnBadge({ fen }: TurnBadgeProps) {
  const side = sideToMove(fen)
  return (
    <span
      title={`${side === 'white' ? 'White' : 'Black'} to move`}
      aria-label={`${side} to move`}
      className={`pointer-events-none absolute bottom-1.5 right-1.5 h-5 w-5 rounded-full border-2 shadow ${
        side === 'white' ? 'border-slate-400 bg-white' : 'border-slate-600 bg-slate-900'
      }`}
    />
  )
}

interface MoveStatusRowProps {
  fen: string
  node: GameNode | null
}

/** "After 31.Dc8" — uses source notation (rawSan) when available. */
export function MoveStatusRow({ fen, node }: MoveStatusRowProps) {
  const side = sideToMove(fen)
  const label = node
    ? `After ${node.moveNumber}${node.color === 'white' ? '.' : '...'}${node.rawSan ?? node.san}`
    : null

  return (
    <div className="flex items-center gap-2 text-xs text-slate-500">
      <span
        className={`h-3.5 w-3.5 shrink-0 rounded-full border ${
          side === 'white' ? 'border-slate-400 bg-white' : 'border-slate-600 bg-slate-900'
        }`}
        aria-hidden="true"
      />
      {label ? (
        <span className="font-medium text-slate-600">{label}</span>
      ) : (
        <span className="text-slate-400">{side === 'white' ? 'White' : 'Black'} to move</span>
      )}
    </div>
  )
}
