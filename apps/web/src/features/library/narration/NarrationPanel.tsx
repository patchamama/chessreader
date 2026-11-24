import { useEffect, useMemo, useState } from 'react'
import { buildNarrationScript, CONCEPTS } from '@chess-ebook/chess-shared'
import type { RecognizedGame, Lang } from '@chess-ebook/chess-shared'
import { useNarrationStore, type ActionsSource } from './narrationStore'
import { databaseActionsFor } from './commentActions'
import { useStudyBoardStore } from '../store/studyBoardStore'
import { cuesToBoard, CUE_COLORS, CUE_LABELS } from './cueStyles'
import { useSettingsStore } from '../../../shared/settings/settingsStore'
import ChessBoard from '../../../shared/chess/ChessBoard'

interface NarrationPanelProps {
  /** The games recognised in the chapter and the text they were read from. */
  games: RecognizedGame[]
  text: string
  /** Where the narration actions of a comment come from (default: the comments database). */
  actionsFor?: ActionsSource
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
    mismatch: 'El tablero no está en la posición esperada. Las casillas que parpadean no coinciden; así debería estar:',
    restore: 'Restaurar posición', sayColor: 'Decir el color', number: 'Número', numWhite: 'Solo blancas', numBoth: 'Ambos', numNone: 'Nunca',
  },
  en: {
    title: 'Narration', game: 'Game', play: 'Narrate', pause: 'Pause', resume: 'Resume', stop: 'Stop',
    prev: 'Previous step', next: 'Next step', auto: 'Automatic', manual: 'I move',
    autoHint: 'Each move is played on the board by itself',
    manualHint: 'The move is announced and shown; you make it on the board',
    simulate: 'Simulate variations', speed: 'Speed', step: 'Step',
    waiting: 'Make the move on the board', wrong: 'That is not the announced move.',
    concepts: 'Concepts mentioned', none: 'No games in this chapter.', done: 'End of the game.',
    mismatch: 'The board is not in the expected position. Blinking squares differ; this is how it should be:',
    restore: 'Restore position', sayColor: 'Say the colour', number: 'Number', numWhite: 'White only', numBoth: 'Both', numNone: 'Never',
  },
  de: {
    title: 'Erzählung', game: 'Partie', play: 'Vorlesen', pause: 'Pause', resume: 'Weiter', stop: 'Stopp',
    prev: 'Vorheriger Schritt', next: 'Nächster Schritt', auto: 'Automatisch', manual: 'Ich ziehe',
    autoHint: 'Jeder Zug wird von selbst auf dem Brett ausgeführt',
    manualHint: 'Der Zug wird angesagt und gezeigt; du führst ihn auf dem Brett aus',
    simulate: 'Varianten zeigen', speed: 'Tempo', step: 'Schritt',
    waiting: 'Führe den Zug auf dem Brett aus', wrong: 'Das ist nicht der angesagte Zug.',
    concepts: 'Erwähnte Begriffe', none: 'Keine Partien in diesem Kapitel.', done: 'Ende der Partie.',
    mismatch: 'Das Brett steht nicht in der erwarteten Stellung. Blinkende Felder weichen ab; so sollte es aussehen:',
    restore: 'Stellung wiederherstellen', sayColor: 'Farbe ansagen', number: 'Zugnummer', numWhite: 'Nur Weiß', numBoth: 'Beide', numNone: 'Nie',
  },
}

/**
 * Narrates a game of the chapter: a voice reads the moves and the comments
 * while the board plays the moves and lights up what is being said.
 */
export function NarrationPanel({ games, text, actionsFor = databaseActionsFor }: NarrationPanelProps) {
  const activeGame = useStudyBoardStore((s) => s.activeGame)
  const [picked, setPicked] = useState<number | null>(null)
  const activeIndex = games.findIndex((g) => g.tree === activeGame)
  const gameIndex = picked !== null && picked < games.length ? picked : Math.max(0, activeIndex)

  const language = useSettingsStore((s) => s.language)
  const sayColor = useSettingsStore((s) => s.narrationSayColor)
  const sayNumber = useSettingsStore((s) => s.narrationSayNumber)
  const repeatSeconds = useSettingsStore((s) => s.narrationRepeatSeconds)
  const setSettings = useSettingsStore((s) => s.set)
  const orientation = useStudyBoardStore((s) => s.orientation)

  const script = useMemo(() => {
    const game = games[gameIndex]
    if (!game) return []
    return buildNarrationScript(text, game, {
      from: gameIndex > 0 ? games[gameIndex - 1].charEnd : 0,
      to: gameIndex + 1 < games.length ? games[gameIndex + 1].charStart : text.length,
      lang: language, sayColor, sayNumber,
    })
  }, [games, gameIndex, text, language, sayColor, sayNumber])

  const n = useNarrationStore()
  const { load, stop, setOption } = n
  useEffect(() => setOption({ repeatAfter: repeatSeconds }), [repeatSeconds, setOption])
  const setActionsFor = useNarrationStore((s) => s.setActionsFor)
  useEffect(() => {
    setActionsFor(actionsFor)
    return () => setActionsFor(null)
  }, [actionsFor, setActionsFor])
  // (Re)load whenever the chapter, the algorithm or the chosen game changes.
  useEffect(() => {
    const game = games[gameIndex]
    if (game) load(script, game.tree, language)
    return () => stop()
  }, [script, games, gameIndex, load, stop, language])

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
        <label className="flex items-center gap-1">
          <input type="checkbox" checked={sayColor} onChange={(e) => setSettings({ narrationSayColor: e.target.checked })} />
          {t.sayColor}
        </label>
        <label className="flex items-center gap-1">
          {t.number}
          <select
            value={sayNumber}
            onChange={(e) => setSettings({ narrationSayNumber: e.target.value as 'white' | 'both' | 'none' })}
            className="rounded border border-slate-300 bg-white px-1 py-0.5"
          >
            <option value="white">{t.numWhite}</option>
            <option value="both">{t.numBoth}</option>
            <option value="none">{t.numNone}</option>
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

      {n.mismatch && (
        <div role="alert" className="mt-1 rounded border border-red-300 bg-red-50 px-2 py-1.5 text-xs text-red-900">
          <p>{t.mismatch}</p>
          <div className="mt-1 flex items-end gap-2">
            <div className="w-36" data-testid="expected-position">
              <ChessBoard fen={n.mismatch.expectedFen} orientation={orientation} hideLabels />
            </div>
            <button className={button} onClick={n.restorePosition}>{t.restore}</button>
          </div>
        </div>
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
