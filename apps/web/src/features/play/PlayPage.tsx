import { useEffect, useState, type CSSProperties } from 'react'
import { Chess, type Square } from 'chess.js'
import ChessBoard from '../../shared/chess/ChessBoard'
import EvalBar from '../viewer/components/EvalBar'
import { useSettingsStore } from '../../shared/settings/settingsStore'
import { useMoveHints } from '../library/review/useMoveHints'
import { usePlayStore, type Clocks, type PlayerInfo, type PlayMode } from './playStore'
import { LICHESS_BOTS, LICHESS_CLOCKS, LICHESS_PLAY_TOKEN_URL } from './lichessBoard'
import { MOVE_KIND_COLORS, type MoveKind } from './moveJudge'
import { usePageWidth } from '../../shared/layout/pageWidth'
import { httpClient } from '../../shared/api/httpClient'
import { isDemoHost } from '../../shared/env/devMode'
import { useAuthStore } from '../auth/store/authStore'
import { useStatusStore } from '../../shared/layout/statusStore'
import { humanMoves, type HumanMoves } from './humanMoves'
import { lichessThemes, playIdeas } from './playIdeas'
import { loadTraps, trapsAt, type Trap } from '../training/traps'
import { LinePlayer } from '../../shared/chess/LinePlayer'
import { InfoSection } from '../../shared/info/InfoSection'

const TEXT = {
  en: {
    title: 'Play with a tutor', mode: 'Opponent', engine: 'The engine', human: 'A person at this board', lichess: 'Someone on Lichess (casual)', lichessAi: 'The Lichess AI (Stockfish)', lichessBot: 'A Maia bot on Lichess (plays like a person)', serverEngine: 'An engine on the server (Stockfish, Maia, GNU Chess…)', engineName: 'Engine', bot: 'Bot', clock: 'Clock', level: 'Lichess AI level', color: 'I play', white: 'White', black: 'Black', random: 'Random', strength: 'Engine strength', start: 'New game', tutor: 'Tutor', token: 'Set your Lichess token in Settings → Accounts', create: 'Create a token for playing ↗', thinking: 'The engine is thinking…', you: 'You', opp: 'Opponent',
    humanHint: 'What a player of my rating would play (Maia, server)', humanSays: (r: number) => `A ${r} player would play:`,
    ideas: 'Ideas: opening, targets, chances, traps', targets: 'Targets', chances: 'Chances', themes: 'Pattern', trap: 'Trap you can set', falls: 'they fall',
    options: 'Options', hints: 'Colour the moves of the selected piece', status: 'Say how good each move is', bar: 'Evaluation bar', legend: 'Legend of the colours', voice: 'Say the moves aloud', voiceNone: 'No', voiceOpp: "Only the opponent's", voiceBoth: 'Both sides', resign: 'Resign', colours: 'Colours', rated: 'rated', casual: 'casual',
    kinds: { book: 'book move', best: 'best move', good: 'good move', inaccuracy: 'inaccuracy', mistake: 'mistake', blunder: 'blunder' },
    legendKinds: { book: 'Book', best: 'Best', good: 'Good', inaccuracy: 'Inaccuracy', mistake: 'Mistake', blunder: 'Blunder' },
    tb: { win: 'winning (tablebase)', draw: 'drawn (tablebase)', loss: 'losing (tablebase)' },
  },
  es: {
    title: 'Jugar con un tutor', mode: 'Rival', engine: 'El motor', human: 'Una persona en este tablero', lichess: 'Alguien en Lichess (amistosa)', lichessAi: 'La IA de Lichess (Stockfish)', lichessBot: 'Un bot Maia en Lichess (juega como una persona)', serverEngine: 'Un motor del servidor (Stockfish, Maia, GNU Chess…)', engineName: 'Motor', bot: 'Bot', clock: 'Ritmo', level: 'Nivel de la IA de Lichess', color: 'Juego con', white: 'Blancas', black: 'Negras', random: 'Al azar', strength: 'Fuerza del motor', start: 'Nueva partida', tutor: 'Tutor', token: 'Pon tu token de Lichess en Ajustes → Cuentas', create: 'Crear un token para jugar ↗', thinking: 'El motor está pensando…', you: 'Tú', opp: 'Rival',
    humanHint: 'Qué jugaría alguien de mi nivel (Maia, servidor)', humanSays: (r: number) => `Un jugador de ${r} jugaría:`,
    ideas: 'Ideas: apertura, objetivos, oportunidades, celadas', targets: 'Objetivos', chances: 'Oportunidades', themes: 'Patrón', trap: 'Celada posible', falls: 'caen',
    options: 'Opciones', hints: 'Colorear las jugadas de la pieza elegida', status: 'Decir qué tan buena es cada jugada', bar: 'Barra de evaluación', legend: 'Leyenda de los colores', voice: 'Decir las jugadas en voz alta', voiceNone: 'No', voiceOpp: 'Solo las del rival', voiceBoth: 'Las de ambos', resign: 'Abandonar', colours: 'Colores', rated: 'con rating', casual: 'amistosa',
    kinds: { book: 'jugada de libro', best: 'la mejor jugada', good: 'buena jugada', inaccuracy: 'imprecisión', mistake: 'error', blunder: 'error grave' },
    legendKinds: { book: 'Libro', best: 'Mejor', good: 'Buena', inaccuracy: 'Imprecisión', mistake: 'Error', blunder: 'Error grave' },
    tb: { win: 'ganada (tablas de finales)', draw: 'tablas (tablas de finales)', loss: 'perdida (tablas de finales)' },
  },
  de: {
    title: 'Spielen mit Trainer', mode: 'Gegner', engine: 'Die Engine', human: 'Eine Person an diesem Brett', lichess: 'Jemand auf Lichess (ungewertet)', lichessAi: 'Die Lichess-KI (Stockfish)', lichessBot: 'Ein Maia-Bot auf Lichess (spielt wie ein Mensch)', serverEngine: 'Eine Engine auf dem Server (Stockfish, Maia, GNU Chess…)', engineName: 'Engine', bot: 'Bot', clock: 'Bedenkzeit', level: 'Stufe der Lichess-KI', color: 'Ich spiele', white: 'Weiß', black: 'Schwarz', random: 'Zufällig', strength: 'Engine-Stärke', start: 'Neue Partie', tutor: 'Trainer', token: 'Lichess-Token in Einstellungen → Konten eintragen', create: 'Token zum Spielen erstellen ↗', thinking: 'Die Engine denkt…', you: 'Du', opp: 'Gegner',
    humanHint: 'Was ein Spieler meiner Stärke spielen würde (Maia, Server)', humanSays: (r: number) => `Ein Spieler mit ${r} würde spielen:`,
    ideas: 'Ideen: Eröffnung, Ziele, Chancen, Fallen', targets: 'Ziele', chances: 'Chancen', themes: 'Muster', trap: 'Mögliche Falle', falls: 'Fall-Chance',
    options: 'Optionen', hints: 'Züge der gewählten Figur einfärben', status: 'Sagen, wie gut jeder Zug ist', bar: 'Bewertungsbalken', legend: 'Legende der Farben', voice: 'Züge vorlesen', voiceNone: 'Nein', voiceOpp: 'Nur die des Gegners', voiceBoth: 'Beide Seiten', resign: 'Aufgeben', colours: 'Farben', rated: 'gewertet', casual: 'ungewertet',
    kinds: { book: 'Buchzug', best: 'bester Zug', good: 'guter Zug', inaccuracy: 'Ungenauigkeit', mistake: 'Fehler', blunder: 'grober Fehler' },
    legendKinds: { book: 'Buch', best: 'Bester', good: 'Gut', inaccuracy: 'Ungenau', mistake: 'Fehler', blunder: 'Grober Fehler' },
    tb: { win: 'gewonnen (Tablebase)', draw: 'remis (Tablebase)', loss: 'verloren (Tablebase)' },
  },
}

// Hint colours on the board: the three grades of the move hints.
const HINT_COLOR: Record<'good' | 'dubious' | 'bad', string> = { good: MOVE_KIND_COLORS.best, dubious: MOVE_KIND_COLORS.inaccuracy, bad: MOVE_KIND_COLORS.blunder }

const mmss = (ms: number) => {
  const total = Math.max(0, Math.ceil(ms / 1000))
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`
}

/** A clock that ticks down locally between the states Lichess sends. */
function useTicking(clocks: Clocks | null): { white: number; black: number } | null {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!clocks?.running) return
    const id = setInterval(() => setNow(Date.now()), 250)
    return () => clearInterval(id)
  }, [clocks])
  if (!clocks) return null
  const spent = clocks.running ? Math.max(0, now - clocks.at) : 0
  return {
    white: clocks.white - (clocks.running === 'white' ? spent : 0),
    black: clocks.black - (clocks.running === 'black' ? spent : 0),
  }
}

function PlayerRow(p: { side: 'white' | 'black'; player: PlayerInfo; time?: number; running: boolean; label: string }) {
  return (
    <div data-testid={`player-${p.side}`} className="flex items-center justify-between rounded border border-slate-200 bg-white px-2 py-1 text-sm">
      <span>
        <span aria-hidden="true" className={`mr-1.5 inline-block h-3 w-3 rounded-full border border-slate-400 ${p.side === 'white' ? 'bg-white' : 'bg-slate-800'}`} />
        <span className="sr-only">{p.label}: </span>
        {p.player.title && <strong className="mr-1 text-amber-700">{p.player.title}</strong>}
        {p.player.name}{p.player.rating ? ` (${p.player.rating})` : ''}
      </span>
      {p.time !== undefined && (
        <span className={`font-mono tabular-nums ${p.running ? 'rounded bg-slate-800 px-1.5 text-white' : 'text-slate-700'} ${p.time < 20000 ? 'text-red-600' : ''}`}>{mmss(p.time)}</span>
      )}
    </div>
  )
}

/** Play against the engine, a person or a Lichess opponent while a tutor comments every move (S27). */
export default function PlayPage() {
  const lang = useSettingsStore((s) => s.language)
  const t = TEXT[lang]
  const p = usePlayStore()
  const settings = useSettingsStore()
  const pageWidth = usePageWidth('max-w-5xl')
  // The status bar: mode, opponent, clocks, time played.
  const [startedAt, setStartedAt] = useState<number | null>(null)
  const [nowTick, setNowTick] = useState(() => Date.now())
  useEffect(() => {
    if (p.status === 'idle') { setStartedAt(null); return }
    setStartedAt((s) => s ?? Date.now())
  }, [p.status])
  useEffect(() => {
    if (!startedAt || p.status === 'over') return
    const id = setInterval(() => setNowTick(Date.now()), 1000)
    return () => clearInterval(id)
  }, [startedAt, p.status])
  useEffect(() => {
    const st = useStatusStore.getState()
    st.setStatus('play.mode', t.mode, p.status === 'idle' ? '' : `${p.mode}${p.players ? ` · ${p.players.white.name} – ${p.players.black.name}` : ''}`)
    st.setStatus('play.moves', 'Moves', p.sans.length ? String(Math.ceil(p.sans.length / 2)) : '')
    st.setStatus('play.time', 'Time', startedAt ? mmss(nowTick - startedAt) : '')
    st.setStatus('play.status', 'Status', p.result || (p.status === 'thinking' ? t.thinking : ''))
  }, [p.status, p.mode, p.players, p.sans.length, p.result, startedAt, nowTick, t])
  useEffect(() => () => useStatusStore.getState().clearStatus('play.'), [])
  const [mode, setMode] = useState<PlayMode>('engine')
  const [color, setColor] = useState<'white' | 'black' | 'random'>('white')
  const [strength, setStrength] = useState(3)
  const [bot, setBot] = useState<string>(LICHESS_BOTS[1].id)
  // Engines on the server (Stockfish, Maia nets, GNU Chess), when there is a server.
  const [serverEngines, setServerEngines] = useState<{ id: string; name: string; style: string }[]>([])
  const [serverEngine, setServerEngine] = useState('')
  useEffect(() => {
    if (isDemoHost() || !useAuthStore.getState().token) return
    httpClient<{ engines: { id: string; name: string; style: string }[] }>('/api/engine/players', { method: 'GET' })
      .then((r) => { setServerEngines(r.engines); if (r.engines[0]) setServerEngine(r.engines[0].id) }, () => setServerEngines([]))
  }, [])
  // One Lichess token, kept in Settings → Accounts.
  const token = useSettingsStore((s) => s.lichessToken || s.lichessPlayToken)
  const [clock, setClock] = useState(`${LICHESS_CLOCKS[0].minutes}+${LICHESS_CLOCKS[0].increment}`)
  const online = mode === 'lichess' || mode === 'lichess-ai' || mode === 'lichess-bot'
  const [selected, setSelected] = useState<string | null>(null)
  const targets = selected ? new Chess(p.fen).moves({ square: selected as Square, verbose: true }).map((m) => m.to) : []
  const myTurn = p.status === 'playing' && (p.mode === 'human' || (p.fen.split(' ')[1] === 'w') === (p.color === 'white'))
  const hints = useMoveHints(p.fen, selected, settings.playMoveHints && myTurn)
  const ticking = useTicking(p.clocks)
  const [human, setHuman] = useState<{ fen: string; value: HumanMoves | null } | null>(null)
  useEffect(() => {
    if (!settings.playHumanHint || !myTurn) return
    let live = true
    void humanMoves(p.fen, settings.playHumanRating).then((value) => { if (live) setHuman({ fen: p.fen, value }) })
    return () => { live = false }
  }, [p.fen, myTurn, settings.playHumanHint, settings.playHumanRating])
  // Ideas for my move (S3) and the pattern of the last move (S4).
  const ideas = settings.playIdeas && myTurn && p.mode !== 'human' ? playIdeas(p.fen, p.sans, p.color, lang) : null
  // Traps that can still be set from here, by my side (S3, S16).
  const [traps, setTraps] = useState<Trap[]>([])
  useEffect(() => { if (settings.playIdeas) void loadTraps().then(setTraps) }, [settings.playIdeas])
  const trapHere = ideas ? trapsAt(p.fen, traps).filter((x) => x.trap.side === p.color).slice(0, 2) : []
  const lastThemes = (() => {
    if (!p.sans.length) return []
    try {
      const c = new Chess()
      for (const san of p.sans.slice(0, -1)) c.move(san)
      return lichessThemes(c.fen(), p.sans[p.sans.length - 1])
    } catch {
      return []
    }
  })()
  const humanHere = settings.playHumanHint && myTurn && human?.fen === p.fen ? human.value : null
  const click = (square: string) => {
    if (selected && targets.includes(square as Square)) {
      p.move(selected, square)
      setSelected(null)
      return
    }
    const piece = new Chess(p.fen).get(square as Square)
    setSelected(piece && piece.color === p.fen.split(' ')[1] ? square : null)
  }
  const field = 'rounded border border-slate-300 bg-white px-2 py-1 text-sm'
  const check = 'flex items-center gap-1.5 text-xs text-slate-700'

  const squareStyles: Record<string, CSSProperties> = {}
  for (const target of ideas?.targets ?? []) {
    squareStyles[target.square] = { boxShadow: 'inset 0 0 0 3px rgba(234, 88, 12, 0.8)' }
  }
  for (const [square, hint] of Object.entries(hints)) {
    const c = HINT_COLOR[hint]
    squareStyles[square] = { background: `radial-gradient(circle, ${c} 0 30%, transparent 32%)`, boxShadow: `inset 0 0 0 3px ${c}` }
  }
  const orientation = p.mode === 'human' ? 'white' : p.color
  const showLegend = settings.playMoveHints && settings.playLegend && p.status !== 'idle' && p.sans.length < 10
  const j = p.judgement
  const kindOf = new Map(p.judgements.map((x) => [x.ply, x.kind]))
  const top: 'white' | 'black' = orientation === 'white' ? 'black' : 'white'
  const row = (side: 'white' | 'black') =>
    p.players && (
      <PlayerRow side={side} player={p.players[side]} label={side === 'white' ? t.white : t.black}
        time={ticking?.[side]} running={p.clocks?.running === side} />
    )

  return (
    <div className={`mx-auto flex ${pageWidth} flex-col gap-4 px-4 py-6 md:flex-row`}>
      <div className="w-full max-w-[520px]">
        {row(top)}
        <div className="my-1 flex gap-2">
          {settings.playEvalBar && p.status !== 'idle' && <div className="w-6 shrink-0"><EvalBar fen={p.fen} direction="vertical" /></div>}
          <div className="min-w-0 flex-1">
            <ChessBoard
              fen={p.fen}
              orientation={orientation}
              lastMove={p.lastMove}
              allowDragging={p.status === 'playing'}
              onPieceDrop={(from, to) => { setSelected(null); return p.move(from, to) }}
              onSquareClick={p.status === 'playing' ? click : undefined}
              selectedSquare={selected}
              legalTargets={Object.keys(hints).length ? [] : targets}
              customSquareStyles={squareStyles}
            />
          </div>
        </div>
        {row(top === 'white' ? 'black' : 'white')}
        {p.gameInfo && (
          <a className="mt-1 block text-xs text-blue-700 underline" href={p.gameInfo.url} target="_blank" rel="noreferrer">
            Lichess: {p.gameInfo.speed} · {p.gameInfo.rated ? t.rated : t.casual}
          </a>
        )}
        {settings.playMoveStatus && j && (
          <p data-testid="move-status" className="mt-2 flex items-center gap-2 text-sm">
            <span aria-hidden="true" className="inline-block h-3 w-3 rounded-full" style={{ background: MOVE_KIND_COLORS[j.kind] }} />
            <span>
              <strong>{j.san}</strong>: {t.kinds[j.kind]}
              {j.opening ? ` · ${j.opening}` : ''}
              {j.tablebase ? ` · ${t.tb[j.tablebase as keyof typeof t.tb] ?? j.tablebase}` : ''}
              {!j.opening && !j.tablebase && j.loss >= 2 ? ` (−${j.loss}%)` : ''}
            </span>
          </p>
        )}
        {lastThemes.length > 0 && <p data-testid="move-themes" className="mt-1 text-xs text-slate-600">🧩 {t.themes}: {lastThemes.join(', ')}</p>}
        {ideas && (ideas.opening || ideas.targets.length > 0 || ideas.chances.length > 0 || trapHere.length > 0) && (
          <div data-testid="play-ideas" className="mt-2 rounded border border-amber-200 bg-amber-50 p-2 text-xs text-amber-950">
            {ideas.opening && <p>📖 {ideas.opening}</p>}
            {ideas.targets.length > 0 && <p>🎯 {t.targets}: {ideas.targets.map((x) => `${x.square} (${x.why})`).join(', ')}</p>}
            {ideas.chances.length > 0 && <p>⚡ {t.chances}: {ideas.chances.join(' ')}</p>}
            {trapHere.map(({ trap, ply }) => (
              <div key={trap.id}>
                <p>🪤 {t.trap}: <strong>{lang === 'es' && trap.titleEs ? trap.titleEs : trap.title}</strong> — {trap.sans[ply]}{trap.fall ? ` (${t.falls} ${trap.fall}/5)` : ''}</p>
                <LinePlayer key={p.fen} fen={p.fen} moves={trap.sans.slice(ply)} orientation={p.color} initiallyOpen={false} testId="play-trap-line" className="ml-4" />
              </div>
            ))}
            <InfoSection topic="ideas" opening={ideas.opening} themes={lastThemes}
              idea={trapHere.map(({ trap }) => (lang === 'es' && trap.introEs ? trap.introEs : trap.intro)).join(' ') || undefined} testId="play-info" />
          </div>
        )}
        {humanHere && humanHere.moves.length > 0 && (
          <p data-testid="human-moves" className="mt-1 text-sm text-slate-700">
            🧑 {t.humanSays(humanHere.rating)} {humanHere.moves.map((m) => `${m.san} (${Math.round(m.probability * 100)}%)`).join(', ')}
          </p>
        )}
        {showLegend && (
          <ul aria-label={t.colours} className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-slate-600">
            {(Object.keys(MOVE_KIND_COLORS) as MoveKind[]).map((k) => (
              <li key={k} className="flex items-center gap-1">
                <span aria-hidden="true" className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: MOVE_KIND_COLORS[k] }} />
                {t.legendKinds[k]}
              </li>
            ))}
          </ul>
        )}
        <p className="mt-2 text-sm text-slate-600">
          {p.sans.map((s, i) => {
            const kind = kindOf.get(i + 1)
            return (
              <span key={i}>
                {i % 2 === 0 ? `${i / 2 + 1}. ` : ''}
                <span style={kind ? { color: MOVE_KIND_COLORS[kind], fontWeight: 600 } : undefined}>{s}</span>{' '}
              </span>
            )
          })}
        </p>
        {p.status === 'thinking' && <p className="text-xs text-slate-500">{t.thinking}</p>}
        {p.result && <p className="mt-1 font-semibold">{p.result}</p>}
      </div>
      <div className="flex flex-1 flex-col gap-3">
        <h1 className="text-xl font-bold text-slate-800">{t.title}</h1>
        <div className="flex flex-wrap items-end gap-2">
          <label className="flex flex-col text-xs text-slate-600">{t.mode}
            <select aria-label={t.mode} className={field} value={mode} onChange={(e) => setMode(e.target.value as PlayMode)}>
              <option value="engine">{t.engine}</option>
              <option value="human">{t.human}</option>
              <option value="lichess">{t.lichess}</option>
              <option value="lichess-ai">{t.lichessAi}</option>
              <option value="lichess-bot">{t.lichessBot}</option>
              {serverEngines.length > 0 && <option value="server">{t.serverEngine}</option>}
            </select>
          </label>
          {(mode === 'engine' || mode === 'lichess-ai' || mode === 'lichess-bot' || mode === 'server') && (
            <label className="flex flex-col text-xs text-slate-600">{t.color}
              <select aria-label={t.color} className={field} value={color} onChange={(e) => setColor(e.target.value as 'white' | 'black' | 'random')}>
                <option value="white">{t.white}</option>
                <option value="black">{t.black}</option>
                <option value="random">{t.random}</option>
              </select>
            </label>
          )}
          {(mode === 'engine' || mode === 'lichess-ai' || (mode === 'server' && !serverEngine.startsWith('maia'))) && (
            <label className="flex flex-col text-xs text-slate-600">{t.strength} ({strength}/8)
              <input aria-label={t.strength} type="range" min={1} max={8} value={strength} onChange={(e) => setStrength(Number(e.target.value))} />
            </label>
          )}
          {mode === 'server' && (
            <label className="flex flex-col text-xs text-slate-600">{t.engineName}
              <select aria-label={t.engineName} className={field} value={serverEngine} onChange={(e) => setServerEngine(e.target.value)}>
                {serverEngines.map((e) => <option key={e.id} value={e.id} title={e.style}>{e.name}</option>)}
              </select>
            </label>
          )}
          {mode === 'lichess-bot' && (
            <label className="flex flex-col text-xs text-slate-600">{t.bot}
              <select aria-label={t.bot} className={field} value={bot} onChange={(e) => setBot(e.target.value)}>
                {LICHESS_BOTS.map((b) => <option key={b.id} value={b.id}>{b.label}</option>)}
              </select>
            </label>
          )}
          {online && (
            <label className="flex flex-col text-xs text-slate-600">{t.clock}
              <select aria-label={t.clock} className={field} value={clock} onChange={(e) => setClock(e.target.value)}>
                {LICHESS_CLOCKS.map((c) => <option key={`${c.minutes}+${c.increment}`} value={`${c.minutes}+${c.increment}`}>{c.minutes}+{c.increment}</option>)}
              </select>
            </label>
          )}
          {online && (
            <p className="flex flex-col text-xs text-slate-600">
              {token ? '✓ Lichess token (Settings → Accounts)' : t.token}
              {!token && <a className="text-blue-700 underline" href={LICHESS_PLAY_TOKEN_URL} target="_blank" rel="noreferrer">{t.create}</a>}
            </p>
          )}
          <button
            className="rounded bg-blue-600 px-3 py-1 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
            disabled={online && !token.trim()}
            onClick={() => {
              const [minutes, increment] = clock.split('+').map(Number)
              setSelected(null)
              const side = color === 'random' ? (Math.random() < 0.5 ? 'white' : 'black') : color
              p.start({ mode, color: side, strength, lang, token: token.trim(), ...(online ? { clock: { minutes, increment } } : {}), ...(mode === 'lichess-bot' ? { bot } : {}), ...(mode === 'server' ? { serverEngine } : {}) })
            }}
          >
            {t.start}
          </button>
          {(p.status === 'playing' || p.status === 'thinking') && p.mode !== 'human' && (
            <button className="rounded border border-slate-300 bg-white px-3 py-1 text-sm text-slate-700 hover:bg-slate-50" onClick={p.resign}>{t.resign}</button>
          )}
        </div>
        <fieldset className="flex flex-wrap gap-x-4 gap-y-1.5 rounded border border-slate-200 bg-white p-2">
          <legend className="px-1 text-xs font-semibold text-slate-700">{t.options}</legend>
          <label className={check}><input type="checkbox" checked={settings.playMoveHints} onChange={(e) => settings.set({ playMoveHints: e.target.checked })} />{t.hints}</label>
          <label className={check}><input type="checkbox" checked={settings.playLegend} onChange={(e) => settings.set({ playLegend: e.target.checked })} />{t.legend}</label>
          <label className={check}><input type="checkbox" checked={settings.playMoveStatus} onChange={(e) => settings.set({ playMoveStatus: e.target.checked })} />{t.status}</label>
          <label className={check}><input type="checkbox" checked={settings.playIdeas} onChange={(e) => settings.set({ playIdeas: e.target.checked })} />{t.ideas}</label>
          <label className={check}><input type="checkbox" checked={settings.playEvalBar} onChange={(e) => settings.set({ playEvalBar: e.target.checked })} />{t.bar}</label>
          <label className={check}>
            <input type="checkbox" checked={settings.playHumanHint} onChange={(e) => settings.set({ playHumanHint: e.target.checked })} />{t.humanHint}
            <select aria-label="Maia rating" className="rounded border border-slate-300 bg-white px-1 py-0.5" value={settings.playHumanRating} onChange={(e) => settings.set({ playHumanRating: Number(e.target.value) })}>
              {[1100, 1200, 1300, 1400, 1500, 1600, 1700, 1800, 1900].map((r) => <option key={r} value={r}>{r}</option>)}
            </select>
          </label>
          <label className={check}>{t.voice}
            <select aria-label={t.voice} className="rounded border border-slate-300 bg-white px-1 py-0.5" value={settings.playVoice} onChange={(e) => settings.set({ playVoice: e.target.value as 'none' | 'opponent' | 'both' })}>
              <option value="none">{t.voiceNone}</option>
              <option value="opponent">{t.voiceOpp}</option>
              <option value="both">{t.voiceBoth}</option>
            </select>
          </label>
        </fieldset>
        {p.error && <p role="alert" className="rounded border border-red-300 bg-red-50 px-2 py-1 text-sm text-red-800">{p.error}</p>}
        <section aria-label={t.tutor} className="flex max-h-[60vh] flex-col gap-1 overflow-y-auto rounded border border-slate-200 bg-white p-2">
          <h2 className="text-sm font-semibold text-slate-700">🎓 {t.tutor}</h2>
          {p.log.map((n, i) => (
            <p key={i} className={`text-sm ${n.who === 'tutor' ? 'text-indigo-800' : n.who === 'opponent' ? 'text-rose-800' : 'text-slate-800'}`}>
              <span className="mr-1 text-xs text-slate-400">{Math.ceil(n.ply / 2)}.</span>
              {n.who === 'opponent' ? `${t.opp}: ` : ''}{n.text}
            </p>
          ))}
        </section>
      </div>
    </div>
  )
}
