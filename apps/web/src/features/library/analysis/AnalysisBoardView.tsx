import { useEffect, useMemo, useState } from 'react'
import ChessBoardThemed from '../../../shared/chess/ChessBoard'
import { playLine } from '../../../shared/chess/playLine'
import { useNotation } from '../../../shared/chess/notation'
import { NotationToggle } from '../../../shared/chess/NotationToggle'
import { useSettingsStore, type AppLanguage } from '../../../shared/settings/settingsStore'
import { boardLine } from './analysisLine'
import type { AnalysisBoardInput } from './analysisBoards'
import { useCommentNarration } from './useCommentNarration'


const T: Record<AppLanguage, Record<string, string>> = {
  en: { first: 'First position', prev: 'Previous move', next: 'Next move', last: 'Last move', play: 'Play', pause: 'Pause', narrate: 'Narrate', stop: 'Stop narrating', moves: 'Moves', flip: 'Flip board' },
  es: { first: 'Posición inicial', prev: 'Jugada anterior', next: 'Siguiente jugada', last: 'Última jugada', play: 'Reproducir', pause: 'Pausa', narrate: 'Narrar', stop: 'Detener la narración', moves: 'Jugadas', flip: 'Girar el tablero' },
  de: { first: 'Ausgangsstellung', prev: 'Vorheriger Zug', next: 'Nächster Zug', last: 'Letzter Zug', play: 'Abspielen', pause: 'Pause', narrate: 'Vorlesen', stop: 'Vorlesen beenden', moves: 'Züge', flip: 'Brett drehen' },
}

/** One move a second when the line plays by itself. */
const STEP_MS = 1000

/**
 * One analysis board: the line or game it was opened with (⏮ ◀ ▶ ⏭ and play),
 * its moves (clickable), the comment and where it comes from, and "Narrate":
 * the comment is read aloud while the moves it quotes are played and what it
 * names is lit up — on this board only, never on the study board.
 */
export function AnalysisBoardView({ board }: { board: AnalysisBoardInput }) {
  const lang = useSettingsStore((s) => s.language)
  const t = T[lang] ?? T.en
  const notation = useNotation()
  const { startFen, moves } = useMemo(() => boardLine(board), [board])
  const { positions } = useMemo(() => playLine(startFen, moves), [startFen, moves])
  const total = positions.length
  const [ply, setPly] = useState(() => Math.max(0, Math.min(board.ply ?? 0, total)))
  const [playing, setPlaying] = useState(false)
  const [flipped, setFlipped] = useState(false)
  const { view, narrating, narrate, stop: stopNarration, clearView } = useCommentNarration({
    text: board.text ?? '', lang, startFen, positions, ply, setPly, onStart: () => setPlaying(false),
  })

  useEffect(() => {
    if (!playing) return
    if (ply >= total) { setPlaying(false); return }
    const id = setTimeout(() => setPly((p) => Math.min(p + 1, total)), STEP_MS)
    return () => clearTimeout(id)
  }, [playing, ply, total])

  const go = (n: number) => { setPlaying(false); clearView(); setPly(Math.max(0, Math.min(total, n))) }

  const shown = ply > 0 ? positions[ply - 1] : null
  const fen = view?.fen ?? shown?.fen ?? startFen
  const lastMove = view ? view.lastMove : shown ? { from: shown.from, to: shown.to } : null
  const sideToMove = startFen.split(' ')[1] === 'b' ? 'black' : 'white'
  const orientation = flipped ? (sideToMove === 'white' ? 'black' : 'white') : sideToMove
  const button = 'rounded border border-slate-300 bg-white px-2 py-0.5 text-xs text-slate-700 hover:bg-slate-50 disabled:opacity-40'
  const [, turn, , , , moveNo] = startFen.split(' ')
  const firstNo = Number(moveNo) || 1
  const blackFirst = turn === 'b'

  return (
    <div className="flex flex-col gap-2" data-testid="analysis-board">
      <div className="mx-auto w-full max-w-[300px]">
        <ChessBoardThemed fen={fen} orientation={orientation} lastMove={lastMove} customSquareStyles={view?.squareStyles} arrows={view?.arrows} />
      </div>
      <div className="flex flex-wrap items-center justify-center gap-1">
        <button type="button" className={button} aria-label={t.first} disabled={ply === 0} onClick={() => go(0)}>⏮</button>
        <button type="button" className={button} aria-label={t.prev} disabled={ply === 0} onClick={() => go(ply - 1)}>◀</button>
        <button type="button" className={button} aria-label={t.next} disabled={ply >= total} onClick={() => go(ply + 1)}>▶</button>
        <button type="button" className={button} aria-label={t.last} disabled={ply >= total} onClick={() => go(total)}>⏭</button>
        {playing
          ? <button type="button" className={button} aria-label={t.pause} onClick={() => setPlaying(false)}>⏸</button>
          : <button type="button" className={button} aria-label={t.play} disabled={total === 0} onClick={() => { clearView(); if (ply >= total) setPly(0); setPlaying(true) }}>▶ {t.play}</button>}
        <button type="button" className={button} aria-label={t.flip} title={t.flip} onClick={() => setFlipped((f) => !f)}>⇅</button>
        <NotationToggle className={button} />
      </div>
      {total > 0 && (
        <div aria-label={t.moves} className="flex flex-wrap gap-x-1 font-mono text-xs text-slate-700">
          {positions.map((p, i) => {
            const white = blackFirst ? i % 2 === 1 : i % 2 === 0
            const no = firstNo + Math.floor((i + (blackFirst ? 1 : 0)) / 2)
            const prefix = white ? `${no}.` : i === 0 ? `${no}...` : ''
            return (
              <span key={i} className="inline-flex items-center gap-0.5">
                {prefix && <span className="text-slate-400">{prefix}</span>}
                <button type="button" className={`rounded px-0.5 hover:bg-amber-100${i === ply - 1 ? ' bg-amber-200 font-semibold' : ''}`} onClick={() => go(i + 1)}>{notation.san(p.san)}</button>
              </span>
            )
          })}
        </div>
      )}
      {board.text && (
        <div className="rounded border border-slate-200 bg-slate-50 p-2 text-sm text-slate-800">
          <p className="whitespace-pre-line">{board.text}</p>
          {board.source && <p className="mt-1 text-xs italic text-slate-500">{board.source}</p>}
          <div className="mt-2">
            {narrating
              ? <button type="button" className={button} aria-label={t.stop} onClick={stopNarration}>⏹ {t.stop}</button>
              : <button type="button" className={button} aria-label={t.narrate} onClick={() => void narrate()}>🔊 {t.narrate}</button>}
          </div>
        </div>
      )}
      {!board.text && board.source && <p className="text-xs italic text-slate-500">{board.source}</p>}
    </div>
  )
}
