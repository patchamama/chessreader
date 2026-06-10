import { Chess, type Square } from 'chess.js'
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

/** Convert up to 5 UCI moves from a FEN into numbered SAN notation.
 *  Returns segments like ["1. Re1", "Nf3", "2. b4", "exf6", "3. ..."] */
function pvToSegments(fen: string, pv: string[]): string[] {
  try {
    const chess  = new Chess(fen)
    const result: string[] = []
    const slice  = pv.slice(0, 5)
    // Determine starting move number and whose turn from FEN
    const fenParts   = fen.split(' ')
    let moveNum      = parseInt(fenParts[5] ?? '1')
    let isWhiteTurn  = (fenParts[1] ?? 'w') === 'w'

    for (let i = 0; i < slice.length; i++) {
      const uci   = slice[i]
      const from  = uci.slice(0, 2) as Square
      const to    = uci.slice(2, 4) as Square
      const promo = uci[4] as 'q' | 'r' | 'b' | 'n' | undefined
      const move  = chess.move({ from, to, promotion: promo ?? 'q' })
      if (!move) break

      const san = move.san
      if (isWhiteTurn) {
        result.push(`${moveNum}. ${san}`)
      } else {
        // If very first move is black, show "N... san"
        if (i === 0) result.push(`${moveNum}... ${san}`)
        else result.push(san)
        moveNum++
      }
      isWhiteTurn = !isWhiteTurn
    }
    return result
  } catch {
    return pv.slice(0, 5)
  }
}

function fenAfterMoves(fen: string, pv: string[], upTo: number): string | null {
  try {
    const chess = new Chess(fen)
    for (let i = 0; i < upTo; i++) {
      const uci   = pv[i]
      const from  = uci.slice(0, 2) as Square
      const to    = uci.slice(2, 4) as Square
      const promo = uci[4] as 'q' | 'r' | 'b' | 'n' | undefined
      if (!chess.move({ from, to, promotion: promo ?? 'q' })) return null
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
      <p className="text-[11px] opacity-50 italic">SF10 · calculando…</p>
    )
  }

  return (
    <div className="flex flex-col gap-0.5">
      {lines.map((line) => {
        const score    = formatScore(line)
        const segments = pvToSegments(fen, line.pv)

        return (
          <p key={line.idx} className="text-[11px] leading-snug">
            {/* "SF10 · score" prefix inherits text color */}
            <span className="font-semibold opacity-70 mr-1">SF10 · {score}</span>
            {segments.map((seg, i) => (
              <button
                key={i}
                className="mr-0.5 hover:underline hover:opacity-80 transition-opacity"
                style={{ all: 'unset', cursor: 'pointer' }}
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
                {seg}
              </button>
            ))}
          </p>
        )
      })}
    </div>
  )
}
