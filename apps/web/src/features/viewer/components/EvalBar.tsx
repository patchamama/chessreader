import { useStockfishEval } from '../../../shared/stockfish/useStockfishEval'

interface EvalBarProps {
  fen: string
}

function formatEval(scoreCp?: number, mate?: number): string {
  if (mate !== undefined) return mate > 0 ? `+M${mate}` : `-M${Math.abs(mate)}`
  if (scoreCp === undefined) return '0.0'
  const pawns = scoreCp / 100
  return (pawns > 0 ? '+' : '') + pawns.toFixed(1)
}

export default function EvalBar({ fen }: EvalBarProps) {
  const { loading, scoreCp, mate, depth } = useStockfishEval(fen)

  const label   = loading ? '…' : formatEval(scoreCp, mate)
  const isWhite = mate !== undefined ? mate > 0 : (scoreCp ?? 0) >= 0

  // white fill percentage (left side of bar = white, right = black)
  const whitePct = loading
    ? 50
    : mate !== undefined
      ? (mate > 0 ? 85 : 15)
      : Math.min(85, Math.max(15, 50 + (scoreCp ?? 0) / 10))

  return (
    <div
      className="w-full"
      aria-label={`Evaluation: ${label}`}
      data-depth={depth}
    >
      {/* Horizontal bar */}
      <div className="relative h-3 w-full rounded overflow-hidden bg-gray-800">
        {/* White advantage (left) */}
        <div
          className="absolute inset-y-0 left-0 bg-white transition-all duration-500"
          style={{ width: `${whitePct}%` }}
        />
      </div>

      {/* Score label */}
      <div className="flex justify-between items-center mt-0.5 px-0.5">
        <span className="text-[10px] font-mono font-semibold text-white">
          {isWhite || loading ? label : ''}
        </span>
        {loading && (
          <span className="text-[10px] text-gray-400 animate-pulse">Stockfish…</span>
        )}
        <span className="text-[10px] font-mono font-semibold text-gray-300">
          {!isWhite && !loading ? label : ''}
        </span>
      </div>
    </div>
  )
}
