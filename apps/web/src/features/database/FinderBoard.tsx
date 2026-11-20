import { useEffect, useMemo, useState } from 'react'
import { Chess } from 'chess.js'
import ChessBoard from '../../shared/chess/ChessBoard'
import { legalTargets } from '../training/captured'

const START = new Chess().fen()
/** No pieces at all: the starting point to set up a configuration. */
export const EMPTY_FEN = '8/8/8/8/8/8/8/8 w - - 0 1'

interface Step { fen: string; san: string | null; from?: string; to?: string }

/**
 * An interactive board for Find by position (S4): the user plays moves (click or drag) and
 * `onFen` hears the position after each one, after Back, Reset and Clear. A suggested line
 * (opening or trap) can be replayed move by move with Next while the played moves follow it.
 */
export default function FinderBoard({ line, onFen }: { line: { sans: string[] } | null; onFen: (fen: string) => void }) {
  const [steps, setSteps] = useState<Step[]>([{ fen: START, san: null }])
  const [onLine, setOnLine] = useState<number | null>(line ? 0 : null)
  const [flipped, setFlipped] = useState(false)
  const [selected, setSelected] = useState<string | null>(null)
  const current = steps[steps.length - 1]

  useEffect(() => {
    setSteps([{ fen: START, san: null }])
    setOnLine(line ? 0 : null)
    setSelected(null)
  }, [line])
  useEffect(() => { onFen(current.fen) }, [current.fen, onFen])

  const targets = useMemo(() => (selected ? legalTargets(current.fen, selected) : []), [current.fen, selected])

  const play = (move: string | { from: string; to: string; promotion?: string }): boolean => {
    try {
      const chess = new Chess(current.fen)
      const m = chess.move(move, { strict: false })
      setSteps((s) => [...s, { fen: chess.fen(), san: m.san, from: m.from, to: m.to }])
      setOnLine((i) => (i !== null && line?.sans[i] === m.san ? i + 1 : null))
      setSelected(null)
      return true
    } catch {
      return false
    }
  }
  const click = (square: string) => {
    if (selected && targets.includes(square)) { play({ from: selected, to: square, promotion: 'q' }); return }
    setSelected(legalTargets(current.fen, square).length ? square : null)
  }
  const back = () => {
    if (steps.length < 2) return
    setSteps((s) => s.slice(0, -1))
    setOnLine((i) => (i !== null && i > 0 ? i - 1 : i))
    setSelected(null)
  }
  const restart = (fen: string) => { setSteps([{ fen, san: null }]); setOnLine(fen === START && line ? 0 : null); setSelected(null) }
  const next = line && onLine !== null ? line.sans[onLine] : undefined

  const tool = 'rounded border border-slate-300 bg-white px-1.5 py-0.5 text-xs text-slate-700 hover:bg-slate-50 disabled:opacity-40'
  const last = current.from && current.to ? { from: current.from, to: current.to } : null
  return (
    <div className="w-full max-w-[360px]">
      <div className="aspect-square">
        <ChessBoard fen={current.fen} orientation={flipped ? 'black' : 'white'} lastMove={last} allowDragging
          onPieceDrop={(from, to) => play({ from, to, promotion: 'q' })} onSquareClick={click} selectedSquare={selected} legalTargets={targets} />
      </div>
      <div className="mt-1 flex flex-wrap items-center gap-1">
        <button type="button" className={tool} disabled={steps.length < 2} onClick={back}>Back</button>
        {line && <button type="button" className={tool} disabled={next === undefined} onClick={() => next && play(next)}>Next move of the line</button>}
        <button type="button" className={tool} onClick={() => restart(START)}>Reset</button>
        <button type="button" className={tool} onClick={() => restart(EMPTY_FEN)}>Clear</button>
        <button type="button" className={tool} onClick={() => setFlipped((f) => !f)}>Flip</button>
      </div>
      <p className="mt-1 font-mono text-xs text-slate-600">{steps.filter((s) => s.san).map((s) => s.san).join(' ') || 'Play a move on the board.'}</p>
    </div>
  )
}
