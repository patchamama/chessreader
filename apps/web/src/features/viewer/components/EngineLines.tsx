import { Chess } from 'chess.js'
import { useEngineLines, type EngineLine } from '../../../shared/stockfish/useEngineLines'

interface EngineLinesProps {
  fen: string
  onPreviewFen: (fen: string | null) => void
}

function formatScore(line: EngineLine): string {
  if (line.mate !== undefined)
    return line.mate > 0 ? `+M${line.mate}` : `-M${Math.abs(line.mate)}`
  if (line.scoreCp !== undefined) {
    const p = line.scoreCp / 100
    return (p > 0 ? '+' : '') + p.toFixed(1)
  }
  return '?'
}

function movesLabel(fen: string, pv: string[]): string {
  try {
    const chess = new Chess(fen)
    return pv
      .slice(0, 5)
      .map((uci) => {
        const from = uci.slice(0, 2) as any
        const to   = uci.slice(2, 4) as any
        const promo = uci[4]
        const move = chess.move({ from, to, promotion: promo || 'q' })
        return move ? move.san : uci
      })
      .join(' ')
  } catch {
    return pv.slice(0, 5).join(' ')
  }
}

function fenAfterMoves(fen: string, pv: string[], upTo: number): string | null {
  try {
    const chess = new Chess(fen)
    for (let i = 0; i < upTo; i++) {
      const uci  = pv[i]
      const from = uci.slice(0, 2) as any
      const to   = uci.slice(2, 4) as any
      const promo = uci[4]
      const ok = chess.move({ from, to, promotion: promo || 'q' })
      if (!ok) return null
    }
    return chess.fen()
  } catch {
    return null
  }
}

export default function EngineLines({ fen, onPreviewFen }: EngineLinesProps) {
  const { lines, loading } = useEngineLines(fen, 5)

  if (loading && lines.length === 0) {
    return (
      <div className="text-[11px] text-gray-400 animate-pulse px-1 py-1">
        Calculating engine lines…
      </div>
    )
  }

  return (
    <div className="w-full text-[11px] font-mono space-y-0.5">
      {lines.map((line) => {
        const score = formatScore(line)
        const label = movesLabel(fen, line.pv)
        const moves = label.split(' ')

        return (
          <div key={line.idx} className="flex items-start gap-2">
            {/* Score badge */}
            <span
              className={`shrink-0 w-10 text-right font-semibold ${
                (line.scoreCp ?? 0) >= 0 || (line.mate ?? 0) > 0
                  ? 'text-gray-100'
                  : 'text-gray-400'
              }`}
            >
              {score}
            </span>

            {/* Moves — each clickable */}
            <span className="flex flex-wrap gap-1">
              {moves.map((san, i) => (
                <button
                  key={i}
                  className="hover:text-amber-400 hover:underline cursor-pointer transition-colors"
                  onMouseEnter={() => {
                    const f = fenAfterMoves(fen, line.pv, i + 1)
                    if (f) onPreviewFen(f)
                  }}
                  onMouseLeave={() => onPreviewFen(null)}
                  onClick={() => {
                    const f = fenAfterMoves(fen, line.pv, i + 1)
                    if (f) onPreviewFen(f)
                  }}
                >
                  {san}
                </button>
              ))}
            </span>

            <span className="shrink-0 text-gray-600 ml-auto">d{line.depth}</span>
          </div>
        )
      })}
    </div>
  )
}
