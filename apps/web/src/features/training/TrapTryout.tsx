import { useEffect, useMemo, useState } from 'react'
import { Chess } from 'chess.js'
import { numberLine } from '@chess-ebook/chess-shared'
import { useSettingsStore } from '../../shared/settings/settingsStore'
import { createEngineAnalyser, type AnalysePosition } from '../library/review/reviewEngine'
import { engineMove } from '../play/enginePlayer'
import { trapsAt, type Trap } from './traps'
import { trapContinuations } from './trapExplorer'
import { figurinesOn, localSan, localText } from './trapNotation'
import { TrapBoard } from './TrapBoard'

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
 * another person at the same board.
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
  const reachable = useMemo(() => trapsAt(fen, traps), [fen, traps])
  const next = useMemo(() => trapContinuations(fen, traps), [fen, traps])
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
  const field = 'rounded border border-slate-300 px-1 py-0.5 text-sm'
  const written = localText(numberLine(sans, 1, 'white'), lang, figurines)
  return (
    <div className="flex flex-col items-start gap-3 md:flex-row">
      <TrapBoard fen={fen} orientation={side} lastMove={last ? { from: last.from, to: last.to } : null} testId="tryout-board-box"
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
        </div>
        <p data-testid="tryout-moves" className="mt-2 min-h-[1.25rem] font-mono text-xs">{written}</p>
        <p className="mt-1 text-xs text-slate-600">Traps still reachable: <strong data-testid="tryout-traps">{reachable.length}</strong></p>
        {yourTurn && !over && next.length > 0 && (
          <div className="mt-2">
            <p className="text-xs font-semibold">Moves that keep traps on the board</p>
            <ul className="mt-1 flex flex-col gap-1">
              {next.slice(0, 8).map((n) => (
                <li key={n.san} className="flex flex-wrap items-baseline gap-2">
                  <button type="button" aria-label={`Play ${n.san}`} onClick={() => play(n.san)}
                    className="rounded bg-blue-600 px-2 py-0.5 font-mono text-xs text-white">{localSan(n.san, lang, figurines)}</button>
                  <span className="text-xs text-slate-600">{n.traps.slice(0, 3).map((t) => (lang === 'es' && t.titleEs ? t.titleEs : t.title)).join(' · ')}{n.traps.length > 3 ? ` +${n.traps.length - 3}` : ''}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
        {reachable.length === 0 && sans.length > 0 && <p className="mt-2 text-xs text-slate-500">No trap is reachable from here. Start a new game to try another.</p>}
        {over && <p role="status" className="mt-2 font-semibold">{chess.isCheckmate() ? 'Checkmate!' : 'Game over.'}</p>}
      </div>
    </div>
  )
}
