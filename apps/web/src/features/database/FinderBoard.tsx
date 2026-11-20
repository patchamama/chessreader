import { useEffect, useMemo, useRef, useState } from 'react'
import { Chess } from 'chess.js'
import ChessBoard from '../../shared/chess/ChessBoard'
import { legalTargets } from '../training/captured'
import { numberMoves } from './pgnNormalize'
import { accumulatedView, analyseMoves, legalMoves, perMoveView, type MapResult, type SquareCount } from './commentMap'

const START = new Chess().fen()
/** No pieces at all: the starting point to set up a configuration. */
export const EMPTY_FEN = '8/8/8/8/8/8/8/8 w - - 0 1'

interface Step { fen: string; san: string | null; from?: string; to?: string }
type MapView = 'move' | 'sum'

const FILES = 'abcdefgh'
/** The squares in the order the board draws them. */
function displayOrder(black: boolean): string[] {
  const out: string[] = []
  for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) out.push(black ? `${FILES[7 - c]}${r + 1}` : `${FILES[c]}${8 - r}`)
  return out
}
/** Light to strong amber/red by the share of the maximum. */
const heat = (count: number, max: number) => {
  const t = max > 0 ? count / max : 0
  return count > 0 ? `hsla(${Math.round(45 - 45 * t)}, 95%, 50%, ${(0.25 + 0.5 * t).toFixed(2)})` : 'transparent'
}

/**
 * An interactive board for Find by position (S4): the user plays moves (click or drag) and
 * `onFen` hears the position after each one, after Back, Reset and Clear. A suggested line
 * (opening or trap) can be replayed move by move with Next while the played moves follow it.
 * With `count` (comments of a position, under the filters): selecting a piece writes on each
 * square it can go to the comments the move would find (S19: a faint 0 when none; clicks work
 * on the badge; dragging does not show them), and the comment map button analyses every move
 * of the position (S20), per move or accumulated, as a colour gradient.
 */
export default function FinderBoard({ line, onFen, count }: { line: { sans: string[] } | null; onFen: (fen: string) => void; count?: (fen: string) => Promise<number> }) {
  const [steps, setSteps] = useState<Step[]>([{ fen: START, san: null }])
  const [onLine, setOnLine] = useState<number | null>(line ? 0 : null)
  const [flipped, setFlipped] = useState(false)
  const [selected, setSelected] = useState<string | null>(null)
  const [badges, setBadges] = useState<Record<string, number | null>>({})
  const [mapOn, setMapOn] = useState(false)
  const [view, setView] = useState<MapView>('move')
  const [results, setResults] = useState<MapResult[]>([])
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null)
  const current = steps[steps.length - 1]
  const countRef = useRef(count)
  countRef.current = count

  useEffect(() => {
    setSteps([{ fen: START, san: null }])
    setOnLine(line ? 0 : null)
    setSelected(null)
  }, [line])
  useEffect(() => { onFen(current.fen) }, [current.fen, onFen])

  const targets = useMemo(() => (selected ? legalTargets(current.fen, selected) : []), [current.fen, selected])

  // S19: the comments each move of the selected piece would find.
  useEffect(() => {
    setBadges({})
    if (!selected || !count || mapOn) return
    let live = true
    const moves = legalMoves(current.fen).filter((m) => m.from === selected)
    setBadges(Object.fromEntries(moves.map((m) => [m.to, null])))
    for (const m of moves) {
      count(m.after).then((n) => { if (live) setBadges((b) => ({ ...b, [m.to]: n })) }, () => { if (live) setBadges((b) => ({ ...b, [m.to]: 0 })) })
    }
    return () => { live = false }
  }, [selected, current.fen, count, mapOn])

  // S20: the comment map of the current position, progressively; toggling off or moving cancels it.
  useEffect(() => {
    setResults([])
    setProgress(null)
    if (!mapOn || !count) return
    const ctl = new AbortController()
    const total = legalMoves(current.fen).length
    setProgress({ done: 0, total })
    void analyseMoves(current.fen, count, {
      signal: ctl.signal,
      onResult: (r, done, all) => { setResults((rs) => [...rs, r]); setProgress({ done, total: all }) },
    })
    return () => ctl.abort()
  }, [mapOn, current.fen, count])

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

  const mapView: Map<string, SquareCount> = useMemo(() => (view === 'move' ? perMoveView(results) : accumulatedView(results)), [view, results])
  const max = Math.max(0, ...[...mapView.values()].map((v) => v.count))

  const tool = 'rounded border border-slate-300 bg-white px-1.5 py-0.5 text-xs text-slate-700 hover:bg-slate-50 disabled:opacity-40'
  const last = current.from && current.to ? { from: current.from, to: current.to } : null
  const showMap = mapOn && !!count
  const cells = displayOrder(flipped)
  const played = steps.slice(1).map((s) => s.san as string)

  return (
    <div className="w-full max-w-[360px]">
      <div className="relative aspect-square">
        <ChessBoard fen={current.fen} orientation={flipped ? 'black' : 'white'} lastMove={last} allowDragging
          onPieceDrop={(from, to) => play({ from, to, promotion: 'q' })} onSquareClick={click} selectedSquare={selected} legalTargets={targets} />
        <div className="pointer-events-none absolute inset-0 grid grid-cols-8 grid-rows-8" data-testid="board-overlay">
          {cells.map((sq) => {
            if (showMap) {
              const v = mapView.get(sq)
              if (!v) return <div key={sq} />
              return (
                <div key={sq} data-testid={`map-${sq}`} style={{ backgroundColor: heat(v.count, max) }} className="relative">
                  <span title={`${v.pieces.join(', ')}: ${v.count}`} onClick={() => click(sq)} className="pointer-events-auto absolute right-0 top-0 rounded-bl bg-white/80 px-0.5 text-[10px] font-semibold leading-tight text-slate-900">
                    {v.count}{view === 'sum' && <sup className="ml-px text-[8px] font-normal">{v.pieces.join('')}</sup>}
                  </span>
                </div>
              )
            }
            if (!(sq in badges)) return <div key={sq} />
            const n = badges[sq]
            return (
              <div key={sq} className="relative">
                <span data-testid={`badge-${sq}`} title={n === null ? 'Counting comments…' : `${n} comments if this move is played`} onClick={() => click(sq)}
                  className={`pointer-events-auto absolute right-0 top-0 rounded-bl bg-white/80 px-0.5 text-[10px] font-semibold leading-tight ${n ? 'text-slate-900' : 'text-slate-400'}`}>
                  {n === null ? '…' : n}
                </span>
              </div>
            )
          })}
        </div>
      </div>
      <div className="mt-1 flex flex-wrap items-center gap-1">
        <button type="button" className={tool} disabled={steps.length < 2} onClick={back}>Back</button>
        {line && <button type="button" className={tool} disabled={next === undefined} onClick={() => next && play(next)}>Next move of the line</button>}
        <button type="button" className={tool} onClick={() => restart(START)}>Reset</button>
        <button type="button" className={tool} onClick={() => restart(EMPTY_FEN)}>Clear</button>
        <button type="button" className={tool} onClick={() => setFlipped((f) => !f)}>Flip</button>
        {count && <button type="button" className={tool} aria-pressed={mapOn} onClick={() => setMapOn((o) => !o)}>Comment map</button>}
      </div>
      {showMap && (
        <div className="mt-1 text-xs">
          <div role="group" aria-label="Comment map view" className="inline-flex overflow-hidden rounded border border-slate-300">
            <button type="button" className={`px-1.5 py-0.5 ${view === 'move' ? 'bg-violet-100 font-semibold' : 'bg-white'}`} aria-pressed={view === 'move'} onClick={() => setView('move')}>Per move</button>
            <button type="button" className={`px-1.5 py-0.5 ${view === 'sum' ? 'bg-violet-100 font-semibold' : 'bg-white'}`} aria-pressed={view === 'sum'} onClick={() => setView('sum')}>Accumulated</button>
          </div>
          {progress && (
            <span role="status" className="ml-2 text-slate-600">
              {progress.done < progress.total ? `Analysing: ${progress.done} of ${progress.total} moves` : `Analysed ${progress.total} moves`}
            </span>
          )}
          <p className="mt-1 flex items-center gap-1 text-slate-600" aria-label="Legend">
            <span>0</span>
            <span className="h-2 w-24 rounded" style={{ background: 'linear-gradient(to right, hsla(45,95%,50%,.25), hsla(0,95%,50%,.75))' }} />
            <span>{max} comments</span>
          </p>
        </div>
      )}
      <p className="mt-1 font-mono text-xs text-slate-600">{played.length ? numberMoves(steps[0].fen, played) : 'Play a move on the board.'}</p>
    </div>
  )
}
