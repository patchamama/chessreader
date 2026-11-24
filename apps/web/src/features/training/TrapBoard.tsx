import { useMemo, useState, type CSSProperties } from 'react'
import ChessBoard from '../../shared/chess/ChessBoard'
import { legalTargets } from '../../shared/chess/captured'
import { CapturedPieces } from '../../shared/chess/CapturedPieces'
import { useTrainingPrefs } from './trainingPrefs'
import { TrainingEvalBar, TrainingEvalLine } from './TrainingEval'
import { useTrainingEngine } from './trainingEngine'

export interface BoardArrow { startSquare: string; endSquare: string; color: string }

const MARK: CSSProperties = { backgroundColor: 'rgba(250, 204, 21, 0.45)', boxShadow: 'inset 0 0 0 3px rgba(202, 138, 4, 0.85)' }
const EXPECTED: CSSProperties = { backgroundColor: 'rgba(22, 163, 74, 0.45)' }

/**
 * The training board in its own square, top-aligned box (a tall column or more
 * columns beside it never stretch, squash or space it), with the pieces each
 * side has taken shown small above and below, click-to-move with the legal
 * squares of the selected piece, marked squares (named in a text) and the
 * expected move of a mistake. Every training board can be flipped and can
 * show the engine's evaluation (an option shared by all of them and
 * remembered): a vertical bar at the right of the board, as tall as it, and
 * the engine's line below. `onSelect` hears the piece the user picks (or
 * null), so the caller can show that piece's moves.
 */
export function TrapBoard({ fen, orientation: side, lastMove, arrows = [], marked = [], expected = [], onMove, onSelect, testId = 'trap-board-box' }: {
  fen: string; orientation: 'white' | 'black'; lastMove?: { from: string; to: string } | null
  arrows?: BoardArrow[]; marked?: string[]; expected?: string[]
  onMove?: (from: string, to: string) => boolean; onSelect?: (square: string | null) => void; testId?: string
}) {
  const [selected, setSelected] = useState<{ fen: string; square: string } | null>(null)
  const [flipped, setFlipped] = useState(false)
  const showEval = useTrainingPrefs((s) => s.showEval)
  const setShowEval = useTrainingPrefs((s) => s.setShowEval)
  const evaluation = useTrainingEngine(fen, showEval)
  const orientation = flipped ? (side === 'white' ? 'black' : 'white') : side
  const sel = selected?.fen === fen ? selected.square : null
  const targets = useMemo(() => (sel && onMove ? legalTargets(fen, sel) : []), [fen, sel, onMove])
  const styles: Record<string, CSSProperties> = {}
  for (const sq of marked) styles[sq] = MARK
  for (const sq of expected) styles[sq] = { ...styles[sq], ...EXPECTED }
  const top = orientation === 'white' ? 'black' : 'white'
  const bottom = orientation
  const click = (square: string) => {
    if (!onMove) return
    if (sel && targets.includes(square)) {
      setSelected(null)
      onSelect?.(null)
      onMove(sel, square)
      return
    }
    const picked = legalTargets(fen, square).length ? square : null
    setSelected(picked ? { fen, square } : null)
    onSelect?.(picked)
  }
  const tool = 'rounded border border-slate-300 bg-white px-1.5 py-0.5 text-xs text-slate-700 hover:bg-slate-50'
  return (
    // The box keeps the board at up to 420px (plus the bar when shown), whatever the column beside it holds.
    <div data-testid={testId} className={`w-full shrink-0 self-start ${showEval ? 'max-w-[438px]' : 'max-w-[420px]'}`}>
      <CapturedPieces fen={fen} side={top} />
      <div data-testid={`${testId}-row`} className="flex items-start gap-1.5">
        <div data-testid={`${testId}-square`} className="aspect-square min-w-0 flex-1">
          <ChessBoard fen={fen} orientation={orientation} lastMove={lastMove ?? null} arrows={arrows}
            customSquareStyles={styles} allowDragging={!!onMove}
            onPieceDrop={(from, to) => { setSelected(null); onSelect?.(null); return onMove ? onMove(from, to) : false }}
            onSquareClick={click} selectedSquare={sel} legalTargets={targets} />
        </div>
        {showEval && <TrainingEvalBar fen={fen} result={evaluation} />}
      </div>
      <CapturedPieces fen={fen} side={bottom} />
      <div className="mt-1 flex flex-wrap items-center gap-2">
        <button type="button" className={tool} aria-label="Flip board" title="Flip board" onClick={() => setFlipped((f) => !f)}>⇅ Flip</button>
        <label className="flex items-center gap-1 text-xs text-slate-700">
          <input type="checkbox" aria-label="Show evaluation" checked={showEval} onChange={(e) => setShowEval(e.target.checked)} />Evaluation
        </label>
      </div>
      {showEval && <TrainingEvalLine fen={fen} result={evaluation} />}
    </div>
  )
}
