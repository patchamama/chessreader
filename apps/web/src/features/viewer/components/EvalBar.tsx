import { useStockfishEval } from '../../../shared/stockfish/useStockfishEval'
import { useSettingsStore } from '../../../shared/settings/settingsStore'

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
  const direction = useSettingsStore((s) => s.evalBarDirection)

  const label   = loading ? '…' : formatEval(scoreCp, mate)
  const isWhite = mate !== undefined ? mate > 0 : (scoreCp ?? 0) >= 0

  // white advantage percentage (0-100)
  const whitePct = loading
    ? 50
    : mate !== undefined
      ? (mate > 0 ? 85 : 15)
      : Math.min(85, Math.max(15, 50 + (scoreCp ?? 0) / 10))

  if (direction === 'vertical') {
    return (
      <div
        className="flex flex-col items-center self-stretch shrink-0"
        aria-label={`Evaluation: ${label}`}
        data-depth={depth}
      >
        {/* Vertical bar — half width, full height of the board */}
        <div className="relative w-2 flex-1 bg-gray-800 rounded overflow-hidden border border-gray-600">
          <div
            className="absolute bottom-0 left-0 right-0 bg-white transition-all duration-500"
            style={{ height: `${whitePct}%` }}
          />
        </div>
        <span className="text-[9px] font-mono font-semibold mt-0.5 opacity-60">
          {label}
        </span>
      </div>
    )
  }

  // Horizontal (default)
  return (
    <div
      className="w-full"
      aria-label={`Evaluation: ${label}`}
      data-depth={depth}
    >
      <div className="relative h-3 w-full rounded overflow-hidden bg-gray-800 border border-gray-700">
        <div
          className="absolute inset-y-0 left-0 bg-white transition-all duration-500"
          style={{ width: `${whitePct}%` }}
        />
      </div>
      <div className="flex justify-between items-center mt-0.5 px-0.5">
        <span className="text-[10px] font-mono font-semibold" style={{ color: 'inherit' }}>
          {isWhite && !loading ? label : ''}
        </span>
        {loading && <span className="text-[10px] text-gray-400 animate-pulse">Stockfish…</span>}
        <span className="text-[10px] font-mono font-semibold text-gray-500">
          {!isWhite && !loading ? label : ''}
        </span>
      </div>
    </div>
  )
}
