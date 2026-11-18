import { useEffect, useState } from 'react'
import { localLine, numberLine } from '@chess-ebook/chess-shared'
import ChessBoardThemed from './ChessBoard'
import { HoverLine } from './HoverLine'
import { playLine } from './playLine'
import { useSettingsStore, type AppLanguage } from '../settings/settingsStore'

const T: Record<AppLanguage, { first: string; prev: string; next: string; last: string; play: string; pause: string; replay: string }> = {
  en: { first: 'First position', prev: 'Previous move', next: 'Next move', last: 'Last move', play: 'Play', pause: 'Pause', replay: 'Replay the line' },
  es: { first: 'Posición inicial', prev: 'Jugada anterior', next: 'Siguiente jugada', last: 'Última jugada', play: 'Reproducir', pause: 'Pausa', replay: 'Reproducir la línea' },
  de: { first: 'Ausgangsstellung', prev: 'Vorheriger Zug', next: 'Nächster Zug', last: 'Letzter Zug', play: 'Abspielen', pause: 'Pause', replay: 'Variante abspielen' },
}

/** One move a second when the line plays by itself. */
const STEP_MS = 1000

/**
 * A line of moves (SAN or UCI) from a position: written with move numbers and
 * the piece letters of the language, each move showing its position on hover,
 * with a small board to replay it (first, previous, next, last, play/pause).
 * A line that cannot be played from the position is written as plain text.
 */
export function LinePlayer({ fen, moves, orientation, initiallyOpen = true, testId = 'line-player', className }: {
  fen: string; moves: string[]; orientation?: 'white' | 'black'; initiallyOpen?: boolean; testId?: string; className?: string
}) {
  const lang = useSettingsStore((s) => s.language)
  const t = T[lang] ?? T.en
  const [ply, setPly] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [open, setOpen] = useState(initiallyOpen)
  const { positions, ok } = playLine(fen, moves)
  const total = positions.length

  useEffect(() => {
    if (!playing) return
    if (ply >= total) { setPlaying(false); return }
    const id = setTimeout(() => setPly((p) => Math.min(p + 1, total)), STEP_MS)
    return () => clearTimeout(id)
  }, [playing, ply, total])

  if (!ok || total === 0) return <span data-testid={`${testId}-text`} className={className}>{moves.join(' ')}</span>

  const [, turn, , , , moveNo] = fen.split(' ')
  const text = localLine(numberLine(positions.map((p) => p.san), Number(moveNo) || 1, turn === 'b' ? 'black' : 'white'), lang)
  const shown = ply > 0 ? positions[ply - 1] : null
  const go = (n: number) => { setPlaying(false); setPly(Math.max(0, Math.min(total, n))) }
  const button = 'rounded border border-slate-300 bg-white px-1.5 py-0.5 text-xs text-slate-700 hover:bg-slate-50 disabled:opacity-40'
  const side = orientation ?? (turn === 'b' ? 'black' : 'white')

  return (
    <div data-testid={testId} className={`flex flex-col gap-1 ${className ?? ''}`}>
      <HoverLine text={text} positions={positions} testId={`${testId}-moves`} className="font-mono text-xs" current={open ? ply - 1 : undefined}
        onPick={(i) => { setOpen(true); go(i + 1) }} />
      {!open && (
        <div><button type="button" className={button} onClick={() => setOpen(true)} aria-label={t.replay}>▶ {t.replay}</button></div>
      )}
      {open && (
        <>
          <div data-testid={`${testId}-board`} className="w-[200px] max-w-full">
            <ChessBoardThemed fen={shown?.fen ?? fen} orientation={side} lastMove={shown ? { from: shown.from, to: shown.to } : null} hideLabels />
          </div>
          <div className="flex gap-1">
            <button type="button" className={button} aria-label={t.first} title={t.first} disabled={ply === 0} onClick={() => go(0)}>⏮</button>
            <button type="button" className={button} aria-label={t.prev} title={t.prev} disabled={ply === 0} onClick={() => go(ply - 1)}>◀</button>
            {playing
              ? <button type="button" className={button} aria-label={t.pause} title={t.pause} onClick={() => setPlaying(false)}>⏸</button>
              : <button type="button" className={button} aria-label={t.play} title={t.play} onClick={() => { if (ply >= total) setPly(0); setPlaying(true) }}>▶︎</button>}
            <button type="button" className={button} aria-label={t.next} title={t.next} disabled={ply >= total} onClick={() => go(ply + 1)}>▶</button>
            <button type="button" className={button} aria-label={t.last} title={t.last} disabled={ply >= total} onClick={() => go(total)}>⏭</button>
          </div>
        </>
      )}
    </div>
  )
}
