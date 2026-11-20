import { useEffect, useMemo, useState } from 'react'
import { Chess } from 'chess.js'
import ChessBoard from '../../shared/chess/ChessBoard'
import { legalTargets } from '../training/captured'
import { numberMoves } from './pgnNormalize'
import { replayLine } from './positionInput'
import { accumulatedView, analyseMoves, legalMoves, perMoveView, type MapResult, type SquareCount } from './commentMap'

const START = new Chess().fen()
/** No pieces at all: the starting point to set up a configuration. */
export const EMPTY_FEN = '8/8/8/8/8/8/8/8 w - - 0 1'

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

/** The shared line of Find by position: where it starts, its moves and the one shown (ply = moves played on the board). */
export interface FinderLine { start: string; sans: string[]; ply: number }

/**
 * The interactive board of Find by position (S4, S22), driven by the one line the text box,
 * the move list and the suggestions share: the position shown is the one after `ply` moves,
 * First/Back/Forward/Last and an auto-play (1 s per move) walk the line, and a move played
 * on the board replaces the rest of the line from that ply and goes back through `onLine`.
 * `onFen` hears the position shown. With `count` (comments of a position, under the filters):
 * selecting a piece writes on each square it can go to the comments the move would find
 * (S19: a faint 0 when none; dragging does not show them), and the comment map button
 * analyses every move of the position (S20), per move or accumulated, as a colour gradient.
 */
export default function FinderBoard({ line, onLine, onFen, count }: { line: FinderLine; onLine: (line: FinderLine) => void; onFen: (fen: string) => void; count?: (fen: string) => Promise<number> }) {
  const [flipped, setFlipped] = useState(false)
  const [selected, setSelected] = useState<string | null>(null)
  const [badges, setBadges] = useState<Record<string, number | null>>({})
  const [mapOn, setMapOn] = useState(false)
  const [view, setView] = useState<MapView>('move')
  const [results, setResults] = useState<MapResult[]>([])
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null)
  const [playing, setPlaying] = useState(false)

  const positions = useMemo(() => replayLine(line.start, line.sans), [line.start, line.sans])
  const ply = Math.min(line.ply, positions.length)
  const current = { fen: ply === 0 ? line.start : positions[ply - 1].fen }
  const lastMove = useMemo(() => {
    if (ply === 0) return null
    try {
      const c = new Chess(ply === 1 ? line.start : positions[ply - 2].fen)
      const m = c.move(positions[ply - 1].san as string)
      return { from: m.from, to: m.to }
    } catch { return null }
  }, [line.start, positions, ply])

  useEffect(() => { onFen(current.fen) }, [current.fen, onFen])
  useEffect(() => { setSelected(null) }, [current.fen])
  const atEnd = ply >= positions.length
  const goTo = (p: number) => onLine({ ...line, sans: line.sans, ply: Math.max(0, Math.min(positions.length, p)) })
  // Auto-play: one move a second until the end of the line.
  useEffect(() => {
    if (!playing) return
    if (atEnd) { setPlaying(false); return }
    const t = setTimeout(() => onLine({ ...line, ply: ply + 1 }), 1000)
    return () => clearTimeout(t)
  }, [playing, atEnd, ply, line, onLine])

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

  const play = (move: { from: string; to: string; promotion?: string }): boolean => {
    try {
      const chess = new Chess(current.fen)
      const m = chess.move(move, { strict: false })
      // Playing the next move of the line only walks it; any other move replaces the rest of the line.
      const sans = line.sans[ply] === m.san ? line.sans : [...line.sans.slice(0, ply), m.san]
      onLine({ start: line.start, sans, ply: ply + 1 })
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
  const restart = (fen: string) => { setPlaying(false); onLine({ start: fen, sans: [], ply: 0 }) }

  const mapView: Map<string, SquareCount> = useMemo(() => (view === 'move' ? perMoveView(results) : accumulatedView(results)), [view, results])
  const max = Math.max(0, ...[...mapView.values()].map((v) => v.count))

  const tool = 'rounded border border-slate-300 bg-white px-1.5 py-0.5 text-xs text-slate-700 hover:bg-slate-50 disabled:opacity-40'
  const showMap = mapOn && !!count
  const cells = displayOrder(flipped)
  const played = positions.slice(0, ply).map((m) => m.san as string)

  return (
    <div className="w-full max-w-[360px]">
      <div className="relative aspect-square">
        <ChessBoard fen={current.fen} orientation={flipped ? 'black' : 'white'} lastMove={lastMove} allowDragging
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
        <button type="button" className={tool} aria-label="First move" disabled={ply === 0} onClick={() => { setPlaying(false); goTo(0) }}>⏮</button>
        <button type="button" className={tool} aria-label="Back" disabled={ply === 0} onClick={() => { setPlaying(false); goTo(ply - 1) }}>◀</button>
        <button type="button" className={tool} aria-label={playing ? 'Pause' : 'Play'} aria-pressed={playing} disabled={positions.length === 0 || (atEnd && !playing)} onClick={() => setPlaying((p) => !p)}>{playing ? '⏸' : '▶'}</button>
        <button type="button" className={tool} aria-label="Forward" disabled={atEnd} onClick={() => { setPlaying(false); goTo(ply + 1) }}>▶▶</button>
        <button type="button" className={tool} aria-label="Last move" disabled={atEnd} onClick={() => { setPlaying(false); goTo(positions.length) }}>⏭</button>
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
      <p className="mt-1 font-mono text-xs text-slate-600">{played.length ? numberMoves(line.start, played) : 'Play a move on the board.'}</p>
    </div>
  )
}
