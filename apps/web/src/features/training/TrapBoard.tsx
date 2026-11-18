import { useMemo, useState, type CSSProperties } from 'react'
import ChessBoard from '../../shared/chess/ChessBoard'
import { capturedPieces, legalTargets, pieceGlyph } from './captured'

export interface BoardArrow { startSquare: string; endSquare: string; color: string }

const MARK: CSSProperties = { backgroundColor: 'rgba(250, 204, 21, 0.45)', boxShadow: 'inset 0 0 0 3px rgba(202, 138, 4, 0.85)' }
const EXPECTED: CSSProperties = { backgroundColor: 'rgba(22, 163, 74, 0.45)' }

function Captured({ pieces, testId }: { pieces: string[]; testId: string }) {
  return (
    <div data-testid={testId} className="flex h-4 flex-wrap items-center gap-px text-sm leading-none text-slate-600" aria-label="Captured pieces">
      {pieces.map((p, i) => <span key={i} className={p === p.toUpperCase() ? 'text-slate-400' : 'text-slate-800'}>{pieceGlyph(p)}</span>)}
    </div>
  )
}

/**
 * The training board in its own top-aligned box (a tall column beside it never
 * stretches it), with the pieces each side has taken shown small above and
 * below, click-to-move with the legal squares of the selected piece, marked
 * squares (named in a text) and the expected move of a mistake.
 */
export function TrapBoard({ fen, orientation, lastMove, arrows = [], marked = [], expected = [], onMove, testId = 'trap-board-box' }: {
  fen: string; orientation: 'white' | 'black'; lastMove?: { from: string; to: string } | null
  arrows?: BoardArrow[]; marked?: string[]; expected?: string[]
  onMove?: (from: string, to: string) => boolean; testId?: string
}) {
  const [selected, setSelected] = useState<{ fen: string; square: string } | null>(null)
  const sel = selected?.fen === fen ? selected.square : null
  const targets = useMemo(() => (sel && onMove ? legalTargets(fen, sel) : []), [fen, sel, onMove])
  const styles: Record<string, CSSProperties> = {}
  for (const sq of marked) styles[sq] = MARK
  for (const sq of expected) styles[sq] = { ...styles[sq], ...EXPECTED }
  const taken = capturedPieces(fen)
  const top = orientation === 'white' ? 'black' : 'white'
  const bottom = orientation
  const click = (square: string) => {
    if (!onMove) return
    if (sel && targets.includes(square)) {
      setSelected(null)
      onMove(sel, square)
      return
    }
    setSelected(legalTargets(fen, square).length ? { fen, square } : null)
  }
  return (
    <div data-testid={testId} className="w-full max-w-[420px] shrink-0 self-start">
      <Captured pieces={taken[top]} testId={`captured-${top}`} />
      <ChessBoard fen={fen} orientation={orientation} lastMove={lastMove ?? null} arrows={arrows}
        customSquareStyles={styles} allowDragging={!!onMove}
        onPieceDrop={(from, to) => { setSelected(null); return onMove ? onMove(from, to) : false }}
        onSquareClick={click} selectedSquare={sel} legalTargets={targets} />
      <Captured pieces={taken[bottom]} testId={`captured-${bottom}`} />
    </div>
  )
}
