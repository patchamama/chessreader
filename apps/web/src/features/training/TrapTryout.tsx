import { Fragment, useEffect, useMemo, useState } from 'react'
import { Chess } from 'chess.js'
import { useSettingsStore } from '../../shared/settings/settingsStore'
import { createEngineAnalyser, type AnalysePosition } from '../library/review/reviewEngine'
import { engineMove } from '../play/enginePlayer'
import { trapContinuations, trapsAt, type Trap, type TrapContinuation } from './traps'
import { figurinesOn, localSan } from './trapNotation'
import { TrapBoard, type BoardArrow } from './TrapBoard'
import { TrapPreviewModal } from './TrapPreviewModal'

const HOVER = '#2563eb'
const GREEN = '#16a34a'
/** How long each trap move of a picked piece stays drawn before the next one. */
const CYCLE_MS = 1200

/** Who answers your moves: someone who falls into traps, the engine, or another human at the same board. */
export type TryoutOpponent = 'falls' | 'engine' | 'human'
type MoveSource = (fen: string) => Promise<string | null>

let analyser: AnalysePosition | null = null
/** The engine, created once, the first time it is needed. */
const engine: MoveSource = async (fen) => {
  analyser ??= createEngineAnalyser().analyse
  return engineMove(analyser, fen, 3)
}

/** Any legal move, when there is no engine. */
const anyMove = (fen: string) => {
  const moves = new Chess(fen).moves({ verbose: true })
  const m = moves[Math.floor(Math.random() * moves.length)]
  return m ? `${m.from}${m.to}${m.promotion ?? ''}` : null
}

/**
 * Try a trap in a game: play from the start against an opponent; as moves are
 * played, the traps still reachable from the position are kept and their next
 * moves offered, so you can steer the game into one. The opponent can be one
 * that falls into traps (it plays the trap's line when it can), the engine, or
 * another person at the same board. Traps are found by position, so any move
 * order reaching a trap's line counts. Hovering a proposed move draws it;
 * clicking a piece draws, one after another in green, its trap moves; the
 * played moves can be clicked to go back and try another branch.
 */
export function TrapTryout({ traps, opponent }: { traps: Trap[]; opponent?: MoveSource }) {
  const lang = useSettingsStore((s) => s.language)
  const figurines = useSettingsStore((s) => figurinesOn(s))
  const [side, setSide] = useState<'white' | 'black'>('white')
  const [who, setWho] = useState<TryoutOpponent>('falls')
  const [sans, setSans] = useState<string[]>([])
  const chess = useMemo(() => { const c = new Chess(); for (const m of sans) c.move(m); return c }, [sans])
  const fen = chess.fen()
  const turn = chess.turn() === 'w' ? 'white' : 'black'
  const next = useMemo(() => trapContinuations(fen, traps), [fen, traps])
  // The traps still on the board: those whose line passes here, and those one move away.
  const reachable = useMemo(() => new Set([...trapsAt(fen, traps).map((x) => x.trap), ...next.flatMap((n) => n.traps)]), [fen, traps, next])
  const [hover, setHover] = useState<{ fen: string; move: TrapContinuation } | null>(null)
  const [picked, setPicked] = useState<{ fen: string; square: string } | null>(null)
  const [cycle, setCycle] = useState(0)
  const [preview, setPreview] = useState<Trap | null>(null)
  const hovered = hover?.fen === fen ? hover.move : null
  const pieceLines = useMemo(() => (picked?.fen === fen ? next.filter((n) => n.from === picked.square) : []), [picked, fen, next])
  useEffect(() => {
    setCycle(0)
    if (pieceLines.length < 2) return
    const id = setInterval(() => setCycle((c) => c + 1), CYCLE_MS)
    return () => clearInterval(id)
  }, [pieceLines])
  const shownLine = pieceLines.length ? pieceLines[cycle % pieceLines.length] : null
  const last = chess.history({ verbose: true }).at(-1)
  const over = chess.isGameOver()

  const play = (move: string | { from: string; to: string; promotion?: string }) => {
    const c = new Chess(fen)
    try { const r = c.move(move); setSans((s) => [...s, r.san]); return true } catch { return false }
  }

  // The opponent answers.
  useEffect(() => {
    if (who === 'human' || turn === side || over) return
    let cancelled = false
    const source: MoveSource = opponent ?? (async (f) => {
      if (who === 'falls') {
        const line = trapContinuations(f, traps)[0]
        if (line) return line.san
      }
      try { return (await engine(f)) ?? anyMove(f) } catch { return anyMove(f) }
    })
    const t = setTimeout(() => {
      void source(fen).then((m) => {
        if (cancelled || !m) return
        const uci = /^[a-h][1-8][a-h][1-8][qrbn]?$/.test(m)
        play(uci ? { from: m.slice(0, 2), to: m.slice(2, 4), promotion: m[4] } : m)
      })
    }, opponent ? 0 : 400)
    return () => { cancelled = true; clearTimeout(t) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fen, who, side, over])

  const yourTurn = who === 'human' || turn === side
  const restart = () => setSans([])
  const mine = (ply: number) => (ply % 2 === 0) === (side === 'white')
  // Against an opponent, back goes to your previous turn (the opponent would answer again otherwise).
  const canGoBack = who === 'human' ? sans.length > 0 : sans.some((_, i) => mine(i))
  const back = () => setSans((s) => {
    if (who === 'human') return s.slice(0, -1)
    let n = s.length - 1
    while (n > 0 && !mine(n)) n--
    return s.slice(0, n)
  })
  const field = 'rounded border border-slate-300 px-1 py-0.5 text-sm'
  const arrows: BoardArrow[] = hovered
    ? [{ startSquare: hovered.from, endSquare: hovered.to, color: HOVER }]
    : shownLine ? [{ startSquare: shownLine.from, endSquare: shownLine.to, color: GREEN }] : []
  return (
    <div className="flex flex-col items-start gap-3 md:flex-row">
      <TrapBoard fen={fen} orientation={side} lastMove={last ? { from: last.from, to: last.to } : null} testId="tryout-board-box"
        arrows={arrows} marked={hovered ? [hovered.from, hovered.to] : []} expected={!hovered && shownLine ? [shownLine.from, shownLine.to] : []}
        onSelect={(square) => setPicked(square ? { fen, square } : null)}
        onMove={(from, to) => (yourTurn && !over ? play({ from, to, promotion: 'q' }) : false)} />
      <div className="min-w-0 flex-1 text-sm">
        <div className="flex flex-wrap items-center gap-2">
          <select aria-label="Your side" className={field} value={side} onChange={(e) => { setSide(e.target.value as 'white' | 'black'); restart() }}>
            <option value="white">You play White</option><option value="black">You play Black</option>
          </select>
          <select aria-label="Opponent" className={field} value={who} onChange={(e) => setWho(e.target.value as TryoutOpponent)}>
            <option value="falls">Opponent who falls for traps</option><option value="engine">Engine</option><option value="human">Human (same board)</option>
          </select>
          <button type="button" className="rounded border border-slate-300 px-2 py-0.5 text-xs" onClick={restart}>New game</button>
          <button type="button" className="rounded border border-slate-300 px-2 py-0.5 text-xs disabled:opacity-40" aria-label="Back" title="Back" disabled={!canGoBack} onClick={back}>◀ Back</button>
        </div>
        <p data-testid="tryout-moves" aria-label="Moves played" className="mt-2 min-h-[1.25rem] font-mono text-xs">
          {sans.map((m, i) => (
            <Fragment key={i}>
              {i % 2 === 0 && <span className="text-slate-400">{i / 2 + 1}. </span>}
              <button type="button" title="Go back to this move" onClick={() => setSans((s) => s.slice(0, i + 1))}
                className={`rounded px-0.5 hover:bg-amber-100${i === sans.length - 1 ? ' bg-amber-200 font-semibold' : ''}`}>{localSan(m, lang, figurines)}</button>{' '}
            </Fragment>
          ))}
        </p>
        <p className="mt-1 text-xs text-slate-600">Traps still reachable: <strong data-testid="tryout-traps">{reachable.size}</strong></p>
        {yourTurn && !over && next.length > 0 && (
          <div className="mt-2">
            <p className="text-xs font-semibold">Moves that keep traps on the board</p>
            <ul className="mt-1 flex flex-col gap-1">
              {next.slice(0, 8).map((n) => (
                <li key={n.san} className="flex flex-wrap items-baseline gap-2">
                  <button type="button" aria-label={`Play ${n.san}`} onClick={() => play(n.san)}
                    onMouseEnter={() => setHover({ fen, move: n })} onMouseLeave={() => setHover(null)}
                    onFocus={() => setHover({ fen, move: n })} onBlur={() => setHover(null)}
                    className="rounded bg-blue-600 px-2 py-0.5 font-mono text-xs text-white">{localSan(n.san, lang, figurines)}</button>
                  <span className="text-xs text-slate-600">
                    {n.traps.slice(0, 3).map((t, i) => {
                      const name = lang === 'es' && t.titleEs ? t.titleEs : t.title
                      return (
                        <Fragment key={t.id}>
                          {i > 0 && ' · '}
                          <button type="button" aria-label={`Show the trap ${t.title}`} title="Show this trap: replay it and read its explanation"
                            onClick={() => setPreview(t)} className="text-blue-700 underline decoration-dotted underline-offset-2 hover:text-blue-900">{name}</button>
                        </Fragment>
                      )
                    })}
                    {n.traps.length > 3 ? ` +${n.traps.length - 3}` : ''}{n.kind === 'transposition' ? ' (by another move order)' : ''}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
        {yourTurn && !over && next.length > 0 && <p className="mt-1 text-[11px] text-slate-500">Click a piece to see its trap moves on the board.</p>}
        {reachable.size === 0 && sans.length > 0 && <p className="mt-2 text-xs text-slate-500">No trap is reachable from here. Start a new game to try another.</p>}
        {over && <p role="status" className="mt-2 font-semibold">{chess.isCheckmate() ? 'Checkmate!' : 'Game over.'}</p>}
      </div>
      {preview && <TrapPreviewModal trap={preview} onClose={() => setPreview(null)} />}
    </div>
  )
}
