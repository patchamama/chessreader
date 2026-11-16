import { useEffect, useMemo, useState } from 'react'
import { buildNarrationScript, CONCEPTS } from '@chess-ebook/chess-shared'
import type { RecognizedGame, Lang } from '@chess-ebook/chess-shared'
import { useNarrationStore } from './narrationStore'
import { useStudyBoardStore } from '../store/studyBoardStore'
import { cuesToBoard, CUE_COLORS, CUE_LABELS } from './cueStyles'

interface NarrationPanelProps {
  /** The games recognised in the chapter and the text they were read from. */
  games: RecognizedGame[]
  text: string
}

const T: Record<Lang, Record<string, string>> = {
  es: {
    title: 'Narración', game: 'Partida', play: 'Narrar', pause: 'Pausar', resume: 'Continuar', stop: 'Detener',
    prev: 'Paso anterior', next: 'Paso siguiente', auto: 'Automático', manual: 'Yo muevo',
    autoHint: 'Cada jugada se reproduce sola en el tablero',
    manualHint: 'La jugada se anuncia y se muestra; tú la haces en el tablero',
    simulate: 'Simular variantes', speed: 'Velocidad', step: 'Paso',
    waiting: 'Haz la jugada en el tablero', wrong: 'Esa no es la jugada anunciada.',
    concepts: 'Conceptos mencionados', none: 'No hay partidas en este capítulo.', done: 'Fin de la partida.',
  },
  en: {
    title: 'Narration', game: 'Game', play: 'Narrate', pause: 'Pause', resume: 'Resume', stop: 'Stop',
    prev: 'Previous step', next: 'Next step', auto: 'Automatic', manual: 'I move',
    autoHint: 'Each move is played on the board by itself',
    manualHint: 'The move is announced and shown; you make it on the board',
    simulate: 'Simulate variations', speed: 'Speed', step: 'Step',
    waiting: 'Make the move on the board', wrong: 'That is not the announced move.',
    concepts: 'Concepts mentioned', none: 'No games in this chapter.', done: 'End of the game.',
  },
}

/**
 * Narrates a game of the chapter: a voice reads the moves and the comments
 * while the board plays the moves and lights up what is being said.
 */
export function NarrationPanel({ games, text }: NarrationPanelProps) {
  const activeGame = useStudyBoardStore((s) => s.activeGame)
  const [picked, setPicked] = useState<number | null>(null)
  const activeIndex = games.findIndex((g) => g.tree === activeGame)
  const gameIndex = picked !== null && picked < games.length ? picked : Math.max(0, activeIndex)

  const script = useMemo(() => {
    const game = games[gameIndex]
    if (!game) return []
    return buildNarrationScript(text, game, {
      from: gameIndex > 0 ? games[gameIndex - 1].charEnd : 0,
      to: gameIndex + 1 < games.length ? games[gameIndex + 1].charStart : text.length,
    })
  }, [games, gameIndex, text])

  const n = useNarrationStore()
  const { load, stop } = n
  // (Re)load whenever the chapter, the algorithm or the chosen game changes.
  useEffect(() => {
    const game = games[gameIndex]
    if (game) load(script, game.tree)
    return () => stop()
  }, [script, games, gameIndex, load, stop])

  const t = T[n.lang]
  if (games.length === 0) return <p className="text-xs text-slate-400">{t.none}</p>

  const running = n.status === 'playing' || n.status === 'waiting-move'
  const roles = cuesToBoard(n.cues).roles
  const concepts = n.concepts.map((id) => CONCEPTS.find((c) => c.id === id)).filter((c) => !!c)
  const button = 'rounded border border-slate-200 bg-white px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-40'

  return (
    <section aria-label={t.title} className="rounded-lg border border-emerald-200 bg-emerald-50/40 p-3">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <h3 className="text-xs font-bold uppercase tracking-wider text-emerald-800">{t.title}</h3>
        {games.length > 1 && (
          <label className="flex items-center gap-1 text-[11px] text-slate-600">
            {t.game}
            <select
              value={gameIndex}
              onChange={(e) => setPicked(Number(e.target.value))}
              className="rounded border border-slate-300 bg-white px-1 py-0.5 text-[11px]"
            >
              {games.map((_, i) => (
                <option key={i} value={i}>{i + 1}</option>
              ))}
            </select>
          </label>
        )}
        <span className="ml-auto text-[11px] tabular-nums text-slate-500">
          {t.step} {Math.min(n.stepIndex + 1, script.length)}/{script.length}
        </span>
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        {running ? (
          <button className={button} onClick={n.pause}>⏸ {t.pause}</button>
        ) : (
          <button
            className="rounded border border-emerald-700 bg-emerald-600 px-2 py-1 text-xs font-medium text-white hover:bg-emerald-700"
            onClick={n.play}
          >
            ▶ {n.status === 'paused' ? t.resume : t.play}
          </button>
        )}
        <button className={button} onClick={n.stop} disabled={n.status === 'idle'}>⏹ {t.stop}</button>
        <button className={button} onClick={() => n.goTo(n.stepIndex - 1)} disabled={n.stepIndex === 0} title={t.prev} aria-label={t.prev}>⏮</button>
        <button className={button} onClick={() => n.goTo(n.stepIndex + 1)} disabled={n.stepIndex >= script.length - 1} title={t.next} aria-label={t.next}>⏭</button>
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-slate-700">
        <div role="radiogroup" aria-label={t.title} className="flex overflow-hidden rounded border border-slate-300">
          {(['auto', 'manual'] as const).map((mode) => (
            <button
              key={mode}
              role="radio"
              aria-checked={n.mode === mode}
              title={mode === 'auto' ? t.autoHint : t.manualHint}
              onClick={() => n.setOption({ mode })}
              className={`px-2 py-0.5 ${n.mode === mode ? 'bg-emerald-600 text-white' : 'bg-white text-slate-600 hover:bg-slate-50'}`}
            >
              {mode === 'auto' ? t.auto : t.manual}
            </button>
          ))}
        </div>
        <label className="flex items-center gap-1">
          <input type="checkbox" checked={n.simulate} onChange={(e) => n.setOption({ simulate: e.target.checked })} />
          {t.simulate}
        </label>
        <label className="flex items-center gap-1">
          {t.speed}
          <select
            value={n.rate}
            onChange={(e) => n.setOption({ rate: Number(e.target.value) })}
            className="rounded border border-slate-300 bg-white px-1 py-0.5"
          >
            {[0.75, 1, 1.25, 1.5].map((r) => (
              <option key={r} value={r}>{r}×</option>
            ))}
          </select>
        </label>
      </div>

      <p aria-live="polite" className="mt-2 min-h-[2.5rem] rounded bg-white px-2 py-1.5 text-sm leading-snug text-slate-800">
        {n.status === 'finished' ? t.done : n.caption}
      </p>

      {n.status === 'waiting-move' && n.expected && (
        <p role="status" className="mt-1 rounded border border-amber-300 bg-amber-50 px-2 py-1 text-xs text-amber-900">
          {t.waiting}: <strong className="font-mono">{n.expected.from} → {n.expected.to}</strong>
          {n.wrongAttempts > 0 && <span className="ml-2 text-red-700">{t.wrong}</span>}
        </p>
      )}

      {roles.length > 0 && (
        <ul className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-slate-600">
          {roles.map((role) => (
            <li key={role} className="flex items-center gap-1">
              <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: CUE_COLORS[role] }} />
              {CUE_LABELS[n.lang][role]}
            </li>
          ))}
        </ul>
      )}

      {concepts.length > 0 && (
        <div className="mt-2 border-t border-emerald-200 pt-2">
          <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-emerald-800">{t.concepts}</p>
          <ul className="flex flex-col gap-1">
            {concepts.map((c) => (
              <li key={c!.id}>
                <details className="rounded bg-white px-2 py-1 text-xs text-slate-700">
                  <summary className="cursor-pointer font-medium">{c!.title[n.lang]}</summary>
                  <p className="mt-1 leading-snug text-slate-600">{c!.definition[n.lang]}</p>
                </details>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  )
}
