import { useEffect, useMemo, useRef, useState } from 'react'
import { buildNarrationScript, extractPlayers, TRACK_FORMAT } from '@chess-ebook/chess-shared'
import type { Lang, NarrationTrack, RecognizedGame } from '@chess-ebook/chess-shared'
import { useStudyBoardStore } from '../store/studyBoardStore'
import { useNarrationStore } from '../narration/narrationStore'
import { useSettingsStore } from '../../../shared/settings/settingsStore'
import { formatTime, renderTrack, stateAt } from './track'

const T: Record<Lang, Record<string, string>> = {
  en: {
    title: 'Audio track (MP3)', make: 'Generate MP3 and track', making: 'Generating audio…', load: 'Open a track', sample: 'Load the sample track',
    hint: 'Pick the .json track and its .mp3.', mp3: 'Download MP3', json: 'Download track (JSON)', wait: 'Wait for my move',
    waiting: 'Make the move on the board', other: 'This track belongs to another game.', now: 'Now', close: 'Close track',
    browser: 'A file needs a server voice: choose one in Settings (the browser voice only speaks live).',
  },
  es: {
    title: 'Pista de audio (MP3)', make: 'Generar MP3 y pista', making: 'Generando audio…', load: 'Abrir una pista', sample: 'Cargar la pista de ejemplo',
    hint: 'Elige la pista .json y su .mp3.', mp3: 'Descargar MP3', json: 'Descargar pista (JSON)', wait: 'Esperar mi jugada',
    waiting: 'Haz la jugada en el tablero', other: 'Esta pista es de otra partida.', now: 'Ahora', close: 'Cerrar pista',
    browser: 'Un archivo necesita una voz del servidor: elige una en Ajustes (la voz del navegador solo habla en vivo).',
  },
  de: {
    title: 'Audiospur (MP3)', make: 'MP3 und Spur erzeugen', making: 'Audio wird erzeugt…', load: 'Spur öffnen', sample: 'Beispielspur laden',
    hint: 'Wähle die .json-Spur und ihre .mp3.', mp3: 'MP3 herunterladen', json: 'Spur herunterladen (JSON)', wait: 'Auf meinen Zug warten',
    waiting: 'Führe den Zug auf dem Brett aus', other: 'Diese Spur gehört zu einer anderen Partie.', now: 'Jetzt', close: 'Spur schließen',
    browser: 'Eine Datei braucht eine Server-Stimme: wähle eine in den Einstellungen (die Browser-Stimme spricht nur live).',
  },
}

const same = (a: string, b: string) => a.split(' ').slice(0, 4).join(' ') === b.split(' ').slice(0, 4).join(' ')

interface TrackPlayerProps {
  games: RecognizedGame[]
  text: string
  /** A ready-made track to offer (the demo ships one). */
  sample?: { track: string; audio: string }
}

/**
 * Plays a narration rendered to MP3 together with its track: the board follows
 * the audio — also after a seek — and the strip under the player shows where
 * every move is said.
 */
export function TrackPlayer({ games, text, sample }: TrackPlayerProps) {
  const lang = useSettingsStore((s) => s.language)
  const sayColor = useSettingsStore((s) => s.narrationSayColor)
  const sayNumber = useSettingsStore((s) => s.narrationSayNumber)
  const provider = useSettingsStore((s) => s.voiceProvider)
  const activeGame = useStudyBoardStore((s) => s.activeGame)
  const gameIndex = Math.max(0, games.findIndex((g) => g.tree === activeGame))
  const game = games[gameIndex]
  const audioRef = useRef<HTMLAudioElement>(null)
  const [track, setTrack] = useState<NarrationTrack | null>(null)
  const [audioUrl, setAudioUrl] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [time, setTime] = useState(0)
  const [waitMove, setWaitMove] = useState(false)
  const [waitingFor, setWaitingFor] = useState<number | null>(null)
  const done = useRef(-1) // last move event already made by the user ("wait" mode)
  const t = T[lang]

  const from = gameIndex > 0 ? games[gameIndex - 1].charEnd : 0
  const state = useMemo(() => (track && game ? stateAt(track, game.tree, time) : null), [track, game, time])

  // The board follows the audio: position, lights and caption of what is being said.
  useEffect(() => {
    if (!state || !game || state.nodeId === undefined) return
    const e = state.event
    const board = useStudyBoardStore.getState()
    // "Wait" mode: while a move is announced the board stays on the position before it.
    const hold = waitMove && e.kind === 'move' && done.current < state.index
    const target = hold ? game.tree.nodes.get(state.nodeId!)?.parentId ?? null : state.nodeId
    if (board.activeGame !== game.tree || board.currentNodeId !== target || (board.playFen && !hold)) {
      board.loadPosition(game.tree, target, target !== null && !game.tree.mainline.includes(target))
    }
    useNarrationStore.setState({ cues: state.cues, caption: state.caption })
  }, [state, game, waitMove])

  // "Wait" mode: stop at the end of a move's announcement until it is made on the board.
  useEffect(() => {
    if (!waitMove || !state || state.event.kind !== 'move' || done.current >= state.index) return
    if (time >= state.event.t1 - 0.05) {
      audioRef.current?.pause()
      setWaitingFor(state.index)
    }
  }, [time, state, waitMove])
  useEffect(() => {
    if (waitingFor === null || !track) return
    return useStudyBoardStore.subscribe((s) => {
      const e = track.events[waitingFor]
      if (!s.playFen) return
      if (same(s.playFen, e.fen)) {
        done.current = waitingFor
        setWaitingFor(null)
        void audioRef.current?.play()
      } else {
        useStudyBoardStore.getState().resetPlay()
      }
    })
  }, [waitingFor, track])

  useEffect(() => () => { if (audioUrl?.startsWith('blob:')) URL.revokeObjectURL(audioUrl) }, [audioUrl])
  const close = () => {
    setTrack(null); setAudioUrl(null); setTime(0); setWaitingFor(null); done.current = -1
    useNarrationStore.setState({ cues: [], caption: '' })
  }

  if (!game) return null
  const button = 'rounded border border-slate-200 bg-white px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-40'

  async function generate() {
    setBusy(true); setError(null)
    try {
      const players = extractPlayers(text.slice(from, game.charEnd))
      const script = buildNarrationScript(text, game, {
        from, to: gameIndex + 1 < games.length ? games[gameIndex + 1].charStart : text.length, lang, sayColor, sayNumber,
      })
      const title = players.white && players.black ? `${players.white} – ${players.black}` : text.slice(from, from + 60).split('\n')[0].trim() || 'Narration'
      const out = await renderTrack({ script, tree: game.tree, lang, title, white: players.white, black: players.black })
      done.current = -1
      setTrack(out.track)
      setAudioUrl(URL.createObjectURL(out.audio))
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  async function openFiles(files: FileList | null) {
    setError(null)
    const list = [...(files ?? [])]
    const json = list.find((f) => f.name.endsWith('.json'))
    const audio = list.find((f) => /\.(mp3|m4a|wav|ogg)$/i.test(f.name))
    if (!json || !audio) { setError(t.hint); return }
    try {
      const parsed = JSON.parse(await json.text()) as NarrationTrack
      if (parsed.format !== TRACK_FORMAT || !Array.isArray(parsed.events)) throw new Error(t.hint)
      done.current = -1
      setTrack(parsed)
      setAudioUrl(URL.createObjectURL(audio))
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  async function loadSample() {
    if (!sample) return
    setError(null)
    try {
      const parsed = (await (await fetch(sample.track)).json()) as NarrationTrack
      // As a blob: a blob URL can always be sought, whatever serves the file.
      const audio = await (await fetch(sample.audio)).blob()
      done.current = -1
      setTrack(parsed)
      setAudioUrl(URL.createObjectURL(audio))
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  const save = (name: string, url: string) => { const a = document.createElement('a'); a.href = url; a.download = name; a.click() }
  const seek = (seconds: number) => { if (audioRef.current) audioRef.current.currentTime = seconds; setTime(seconds) }
  const moves = track ? track.events.map((e, i) => ({ e, i })).filter(({ e }) => e.kind === 'move') : []

  return (
    <section aria-label={t.title} className="rounded-lg border border-sky-200 bg-sky-50/50 p-3">
      <div className="mb-2 flex items-center gap-2">
        <h3 className="text-xs font-bold uppercase tracking-wider text-sky-800">{t.title}</h3>
        {track && <button className={`${button} ml-auto`} onClick={close}>✕ {t.close}</button>}
      </div>

      {!track && (
        <div className="flex flex-wrap items-center gap-1.5">
          <button
            className="rounded border border-sky-700 bg-sky-600 px-2 py-1 text-xs font-medium text-white hover:bg-sky-700 disabled:opacity-50"
            onClick={() => void generate()} disabled={busy || provider === 'browser'} title={provider === 'browser' ? t.browser : undefined}
          >
            {busy ? t.making : `🎧 ${t.make}`}
          </button>
          <label className={`${button} cursor-pointer`}>
            {t.load}
            <input type="file" multiple accept=".json,.mp3,audio/*,application/json" className="sr-only" aria-label={t.load} onChange={(e) => void openFiles(e.target.files)} />
          </label>
          {sample && <button className={button} onClick={() => void loadSample()}>{t.sample}</button>}
          {provider === 'browser' && <p className="w-full text-[11px] text-slate-500">{t.browser}</p>}
        </div>
      )}
      {error && <p role="alert" className="mt-1 rounded border border-red-200 bg-red-50 px-2 py-1 text-xs text-red-800">{error}</p>}

      {track && audioUrl && (
        <>
          <p className="truncate text-xs font-semibold text-slate-800">{track.title}</p>
          <audio
            ref={audioRef} src={audioUrl} controls className="mt-1 w-full" data-testid="track-audio"
            onTimeUpdate={(e) => setTime(e.currentTarget.currentTime)}
            onSeeked={(e) => { done.current = -1; setWaitingFor(null); setTime(e.currentTarget.currentTime) }}
          />
          {/* Where every move is said: click to go there. */}
          <div className="relative mt-1 h-4 rounded bg-slate-200" data-testid="track-strip">
            <div className="absolute inset-y-0 left-0 rounded bg-sky-300" style={{ width: `${Math.min(100, (100 * time) / track.audio.duration)}%` }} />
            {moves.map(({ e, i }) => (
              <button
                key={i}
                onClick={() => seek(e.t0)}
                title={`${e.moveNumber}${e.side === 'white' ? '.' : '...'} ${e.san} · ${formatTime(e.t0)}`}
                aria-label={`${e.moveNumber}${e.side === 'white' ? '.' : '...'} ${e.san} · ${formatTime(e.t0)}`}
                className={`absolute top-0 h-4 w-[3px] -translate-x-1/2 ${e.side === 'white' ? 'bg-white ring-1 ring-slate-400' : 'bg-slate-800'} hover:bg-amber-400`}
                style={{ left: `${(100 * e.t0) / track.audio.duration}%` }}
              />
            ))}
          </div>
          {state && (
            <p className="mt-1 text-xs text-slate-700" data-testid="track-now">
              <span className="font-mono tabular-nums">{formatTime(time)} / {formatTime(track.audio.duration)}</span>
              {state.label && <> · {t.now}: <strong className="font-mono">{state.label}</strong></>}
              {state.nodeId === undefined && <span className="ml-2 text-red-700">{t.other}</span>}
            </p>
          )}
          {state && <p className="mt-1 rounded bg-white px-2 py-1 text-sm leading-snug text-slate-800">{state.caption}</p>}
          {waitingFor !== null && (
            <p role="status" className="mt-1 rounded border border-amber-300 bg-amber-50 px-2 py-1 text-xs text-amber-900">
              {t.waiting}: <strong className="font-mono">{track.events[waitingFor].from} → {track.events[waitingFor].to}</strong>
            </p>
          )}
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <label className="flex items-center gap-1 text-[11px] text-slate-700">
              <input type="checkbox" checked={waitMove} onChange={(e) => { setWaitMove(e.target.checked); setWaitingFor(null) }} />
              {t.wait}
            </label>
            <button className={button} onClick={() => save(track.audio.file, audioUrl)}>{t.mp3}</button>
            <button
              className={button}
              onClick={() => {
                const url = URL.createObjectURL(new Blob([JSON.stringify(track, null, 2)], { type: 'application/json' }))
                save(track.audio.file.replace(/\.\w+$/, '.track.json'), url)
                URL.revokeObjectURL(url)
              }}
            >
              {t.json}
            </button>
          </div>
        </>
      )}
    </section>
  )
}
