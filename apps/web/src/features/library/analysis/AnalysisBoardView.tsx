import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import type { Arrow } from 'react-chessboard'
import { analyseComment, commentToSpeechParts } from '@chess-ebook/chess-shared'
import ChessBoardThemed from '../../../shared/chess/ChessBoard'
import { playLine } from '../../../shared/chess/playLine'
import { useNotation } from '../../../shared/chess/notation'
import { NotationToggle } from '../../../shared/chess/NotationToggle'
import { useSettingsStore, type AppLanguage } from '../../../shared/settings/settingsStore'
import { analysisVoice as voice } from './analysisSpeaker'
import { cuesToBoard } from '../narration/cueStyles'
import { boardLine, quotedMoves } from './analysisLine'
import type { AnalysisBoardInput } from './analysisBoards'


const T: Record<AppLanguage, Record<string, string>> = {
  en: { first: 'First position', prev: 'Previous move', next: 'Next move', last: 'Last move', play: 'Play', pause: 'Pause', narrate: 'Narrate', stop: 'Stop narrating', moves: 'Moves', flip: 'Flip board' },
  es: { first: 'Posición inicial', prev: 'Jugada anterior', next: 'Siguiente jugada', last: 'Última jugada', play: 'Reproducir', pause: 'Pausa', narrate: 'Narrar', stop: 'Detener la narración', moves: 'Jugadas', flip: 'Girar el tablero' },
  de: { first: 'Ausgangsstellung', prev: 'Vorheriger Zug', next: 'Nächster Zug', last: 'Letzter Zug', play: 'Abspielen', pause: 'Pause', narrate: 'Vorlesen', stop: 'Vorlesen beenden', moves: 'Züge', flip: 'Brett drehen' },
}

/** One move a second when the line plays by itself. */
const STEP_MS = 1000

const bare = (san: string) => san.replace(/[+#!?]+$/g, '')

interface NarrationView {
  fen: string
  lastMove: { from: string; to: string } | null
  squareStyles: Record<string, CSSProperties>
  arrows: Arrow[]
}

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
  const [view, setView] = useState<NarrationView | null>(null)
  const [narrating, setNarrating] = useState(false)
  const [flipped, setFlipped] = useState(false)
  const run = useRef(0)

  useEffect(() => {
    if (!playing) return
    if (ply >= total) { setPlaying(false); return }
    const id = setTimeout(() => setPly((p) => Math.min(p + 1, total)), STEP_MS)
    return () => clearTimeout(id)
  }, [playing, ply, total])

  // Leaving the board (closing it, another tab) silences it — only its own voice:
  // cancelling when it is not speaking would cut the study's narration.
  const speaking = useRef(false)
  useEffect(() => () => { run.current++; if (speaking.current) voice().cancel() }, [])

  const stopNarration = () => {
    run.current++
    speaking.current = false
    voice().cancel()
    setNarrating(false)
    setView(null)
  }

  const go = (n: number) => { setPlaying(false); setView(null); setPly(Math.max(0, Math.min(total, n))) }

  const narrate = async () => {
    const text = board.text ?? ''
    if (!text.trim()) return
    const token = ++run.current
    setPlaying(false)
    setNarrating(true)
    speaking.current = true
    const parts = commentToSpeechParts(text, lang)
    const quoted = quotedMoves(text)
    let fen = ply > 0 ? positions[ply - 1].fen : startFen
    let lastMove: NarrationView['lastMove'] = ply > 0 ? { from: positions[ply - 1].from, to: positions[ply - 1].to } : null
    let segStart = 0
    for (let k = 0; k < parts.length; k++) {
      if (run.current !== token) return
      const part = parts[k]
      if (part.at !== null) {
        segStart = part.at
        const san = quoted.get(part.at)
        if (san) {
          // The move from where the board is; else a move of the board's own line.
          const r = playLine(fen, [san])
          if (r.ok) {
            fen = r.positions[0].fen
            lastMove = { from: r.positions[0].from, to: r.positions[0].to }
          } else {
            const i = positions.findIndex((p) => bare(p.san) === bare(san))
            if (i >= 0) {
              fen = positions[i].fen
              lastMove = { from: positions[i].from, to: positions[i].to }
              setPly(i + 1)
            }
          }
        }
      }
      const next = parts.slice(k + 1).find((p) => p.at !== null)?.at ?? text.length
      const cues = analyseComment(text.slice(segStart, next), fen, { lastMove })
      const { squareStyles, arrows } = cuesToBoard(cues)
      setView({ fen, lastMove, squareStyles, arrows })
      await voice().speak(part.speech, lang, 1)
      segStart = next
    }
    if (run.current !== token) return
    speaking.current = false
    setNarrating(false)
    setView(null)
  }

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
          : <button type="button" className={button} aria-label={t.play} disabled={total === 0} onClick={() => { setView(null); if (ply >= total) setPly(0); setPlaying(true) }}>▶ {t.play}</button>}
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
