import { useEffect, useRef, useState, type CSSProperties } from 'react'
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
import { loadTraps, trapContinuations, trapsAt, type Trap } from '../training/traps'
import { formatSan } from '../../shared/chess/notation'
import { LinePlayer } from '../../shared/chess/LinePlayer'
import { InfoSection } from '../../shared/info/InfoSection'
import { OpenInStudy } from '../gamesearch/OpenInStudy'
import { commentSource, commentTextFor, lookupPositionComments, type HumanComment } from '../library/commentdb/commentLookup'
import { commentInNotation } from '../library/commentdb/commentNotation'
import { figurinesOn } from '../training/trapNotation'
import type { CueBoard } from '../library/narration/cueStyles'
import type { MoveHint } from '../library/review/reviewEngine'
import { playAnalyse } from './playStore'
import PositionComments from '../comments/PositionComments'
import { usePlayPrefs, type EvalBarPosition, type LiveCommentSide } from './playPrefs'
import { TutorResizeHandle } from './TutorResizeHandle'
import { thinkingNow } from './thinkTime'
import { ideaCues, ideaSegments } from './ideaCues'
import { analyseMoves, analyseSans, describePiece, formatScore, localSan, precomputeHints, type PieceMove } from './pieceAnalysis'
import { bookCandidates, loadPositionIndex, type BookGame, type PositionIndex } from './bookPositions'

/** The game played so far as PGN, with the players' names. */
function gamePgn(sans: string[], players: { white: { name: string }; black: { name: string } } | null): string {
  const chess = new Chess()
  for (const san of sans) { try { chess.move(san) } catch { break } }
  if (players) { chess.setHeader('White', players.white.name); chess.setHeader('Black', players.black.name) }
  return chess.pgn()
}

const TEXT = {
  en: {
    title: 'Play with a tutor', mode: 'Opponent', engine: 'The engine', human: 'A person at this board', lichess: 'Someone on Lichess (casual)', lichessAi: 'The Lichess AI (Stockfish)', lichessBot: 'A Maia bot on Lichess (plays like a person)', serverEngine: 'An engine on the server (Stockfish, Maia, GNU Chess…)', engineName: 'Engine', bot: 'Bot', clock: 'Clock', level: 'Lichess AI level', color: 'I play', white: 'White', black: 'Black', random: 'Random', strength: 'Engine strength', start: 'New game', tutor: 'Tutor', token: 'Set your Lichess token in Settings → Accounts', create: 'Create a token for playing ↗', thinking: 'The engine is thinking…', you: 'You', opp: 'Opponent',
    humanHint: 'What a player of my rating would play (Maia, server)', humanSays: (r: number) => `A ${r} player would play:`,
    ideas: 'Ideas: opening, targets, chances, traps', targets: 'Targets', chances: 'Chances', themes: 'Pattern', trap: 'Trap you can set', trapMoves: 'Moves toward a trap', falls: 'they fall',
    options: 'Options', hints: 'Colour the moves of the selected piece', status: 'Say how good each move is', bar: 'Evaluation bar', legend: 'Legend of the colours', voice: 'Say the moves aloud', voiceNone: 'No', voiceOpp: "Only the opponent's", voiceBoth: 'Both sides', resign: 'Resign', colours: 'Colours', rated: 'rated', casual: 'casual',
    kinds: { book: 'book move', best: 'best move', good: 'good move', inaccuracy: 'inaccuracy', mistake: 'mistake', blunder: 'blunder' },
    legendKinds: { book: 'Book', best: 'Best', good: 'Good', inaccuracy: 'Inaccuracy', mistake: 'Mistake', blunder: 'Blunder' },
    tb: { win: 'winning (tablebase)', draw: 'drawn (tablebase)', loss: 'losing (tablebase)' },
    thinkTime: 'Thinking time', liveComments: 'Book comments', lcOff: 'Off', lcBoth: 'Both sides', lcMine: 'After my moves', lcOpp: "After the opponent's moves",
    gm: 'Play like a human grandmaster', gmTitle: 'What the grandmasters of the books played here', games: (n: number) => `${n} ${n === 1 ? 'game' : 'games'}`,
    explainTouch: 'Explain the piece I touch', positionComments: 'Show the comments of each position', commentsTitle: 'What the books say about this position',
    barPosition: 'Evaluation bar position', barPositions: { left: 'Left', right: 'Right', top: 'Top', bottom: 'Bottom' }, config: 'Settings', resizeTutor: 'Resize the tutor',
  },
  es: {
    title: 'Jugar con un tutor', mode: 'Rival', engine: 'El motor', human: 'Una persona en este tablero', lichess: 'Alguien en Lichess (amistosa)', lichessAi: 'La IA de Lichess (Stockfish)', lichessBot: 'Un bot Maia en Lichess (juega como una persona)', serverEngine: 'Un motor del servidor (Stockfish, Maia, GNU Chess…)', engineName: 'Motor', bot: 'Bot', clock: 'Ritmo', level: 'Nivel de la IA de Lichess', color: 'Juego con', white: 'Blancas', black: 'Negras', random: 'Al azar', strength: 'Fuerza del motor', start: 'Nueva partida', tutor: 'Tutor', token: 'Pon tu token de Lichess en Ajustes → Cuentas', create: 'Crear un token para jugar ↗', thinking: 'El motor está pensando…', you: 'Tú', opp: 'Rival',
    humanHint: 'Qué jugaría alguien de mi nivel (Maia, servidor)', humanSays: (r: number) => `Un jugador de ${r} jugaría:`,
    ideas: 'Ideas: apertura, objetivos, oportunidades, celadas', targets: 'Objetivos', chances: 'Oportunidades', themes: 'Patrón', trap: 'Celada posible', trapMoves: 'Jugadas hacia una celada', falls: 'caen',
    options: 'Opciones', hints: 'Colorear las jugadas de la pieza elegida', status: 'Decir qué tan buena es cada jugada', bar: 'Barra de evaluación', legend: 'Leyenda de los colores', voice: 'Decir las jugadas en voz alta', voiceNone: 'No', voiceOpp: 'Solo las del rival', voiceBoth: 'Las de ambos', resign: 'Abandonar', colours: 'Colores', rated: 'con rating', casual: 'amistosa',
    kinds: { book: 'jugada de libro', best: 'la mejor jugada', good: 'buena jugada', inaccuracy: 'imprecisión', mistake: 'error', blunder: 'error grave' },
    legendKinds: { book: 'Libro', best: 'Mejor', good: 'Buena', inaccuracy: 'Imprecisión', mistake: 'Error', blunder: 'Error grave' },
    tb: { win: 'ganada (tablas de finales)', draw: 'tablas (tablas de finales)', loss: 'perdida (tablas de finales)' },
    thinkTime: 'Tiempo de reflexión', liveComments: 'Comentarios de los libros', lcOff: 'No', lcBoth: 'Ambos bandos', lcMine: 'Tras mis jugadas', lcOpp: 'Tras las del rival',
    gm: 'Jugar como un gran maestro humano', gmTitle: 'Lo que jugaron aquí los grandes maestros de los libros', games: (n: number) => `${n} ${n === 1 ? 'partida' : 'partidas'}`,
    explainTouch: 'Explicar la pieza que toco', positionComments: 'Mostrar los comentarios de cada posición', commentsTitle: 'Lo que dicen los libros de esta posición',
    barPosition: 'Posición de la barra de evaluación', barPositions: { left: 'Izquierda', right: 'Derecha', top: 'Arriba', bottom: 'Abajo' }, config: 'Configuración', resizeTutor: 'Cambiar el tamaño del tutor',
  },
  de: {
    title: 'Spielen mit Trainer', mode: 'Gegner', engine: 'Die Engine', human: 'Eine Person an diesem Brett', lichess: 'Jemand auf Lichess (ungewertet)', lichessAi: 'Die Lichess-KI (Stockfish)', lichessBot: 'Ein Maia-Bot auf Lichess (spielt wie ein Mensch)', serverEngine: 'Eine Engine auf dem Server (Stockfish, Maia, GNU Chess…)', engineName: 'Engine', bot: 'Bot', clock: 'Bedenkzeit', level: 'Stufe der Lichess-KI', color: 'Ich spiele', white: 'Weiß', black: 'Schwarz', random: 'Zufällig', strength: 'Engine-Stärke', start: 'Neue Partie', tutor: 'Trainer', token: 'Lichess-Token in Einstellungen → Konten eintragen', create: 'Token zum Spielen erstellen ↗', thinking: 'Die Engine denkt…', you: 'Du', opp: 'Gegner',
    humanHint: 'Was ein Spieler meiner Stärke spielen würde (Maia, Server)', humanSays: (r: number) => `Ein Spieler mit ${r} würde spielen:`,
    ideas: 'Ideen: Eröffnung, Ziele, Chancen, Fallen', targets: 'Ziele', chances: 'Chancen', themes: 'Muster', trap: 'Mögliche Falle', trapMoves: 'Züge zu einer Falle', falls: 'Fall-Chance',
    options: 'Optionen', hints: 'Züge der gewählten Figur einfärben', status: 'Sagen, wie gut jeder Zug ist', bar: 'Bewertungsbalken', legend: 'Legende der Farben', voice: 'Züge vorlesen', voiceNone: 'Nein', voiceOpp: 'Nur die des Gegners', voiceBoth: 'Beide Seiten', resign: 'Aufgeben', colours: 'Farben', rated: 'gewertet', casual: 'ungewertet',
    kinds: { book: 'Buchzug', best: 'bester Zug', good: 'guter Zug', inaccuracy: 'Ungenauigkeit', mistake: 'Fehler', blunder: 'grober Fehler' },
    legendKinds: { book: 'Buch', best: 'Bester', good: 'Gut', inaccuracy: 'Ungenau', mistake: 'Fehler', blunder: 'Grober Fehler' },
    tb: { win: 'gewonnen (Tablebase)', draw: 'remis (Tablebase)', loss: 'verloren (Tablebase)' },
    thinkTime: 'Bedenkzeit', liveComments: 'Kommentare der Bücher', lcOff: 'Aus', lcBoth: 'Beide Seiten', lcMine: 'Nach meinen Zügen', lcOpp: 'Nach den Zügen des Gegners',
    gm: 'Spielen wie ein menschlicher Großmeister', gmTitle: 'Was die Großmeister der Bücher hier spielten', games: (n: number) => `${n} ${n === 1 ? 'Partie' : 'Partien'}`,
    explainTouch: 'Die berührte Figur erklären', positionComments: 'Kommentare zu jeder Stellung anzeigen', commentsTitle: 'Was die Bücher zu dieser Stellung sagen',
    barPosition: 'Position des Bewertungsbalkens', barPositions: { left: 'Links', right: 'Rechts', top: 'Oben', bottom: 'Unten' }, config: 'Einstellungen', resizeTutor: 'Größe des Trainers ändern',
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

function PlayerRow(p: { side: 'white' | 'black'; player: PlayerInfo; time?: number; running: boolean; label: string; think?: number; thinkLabel: string }) {
  return (
    <div data-testid={`player-${p.side}`} className="flex items-center justify-between rounded border border-slate-200 bg-white px-2 py-1 text-sm">
      <span>
        <span aria-hidden="true" className={`mr-1.5 inline-block h-3 w-3 rounded-full border border-slate-400 ${p.side === 'white' ? 'bg-white' : 'bg-slate-800'}`} />
        <span className="sr-only">{p.label}: </span>
        {p.player.title && <strong className="mr-1 text-amber-700">{p.player.title}</strong>}
        {p.player.name}{p.player.rating ? ` (${p.player.rating})` : ''}
      </span>
      <span className="flex items-center gap-2">
        {p.think !== undefined && (
          <span data-testid={`think-${p.side}`} title={p.thinkLabel} className="font-mono text-xs tabular-nums text-slate-500">
            <span aria-hidden="true">⏱ </span><span className="sr-only">{p.thinkLabel}: </span>{mmss(p.think)}
          </span>
        )}
        {p.time !== undefined && (
          <span className={`font-mono tabular-nums ${p.running ? 'rounded bg-slate-800 px-1.5 text-white' : 'text-slate-700'} ${p.time < 20000 ? 'text-red-600' : ''}`}>{mmss(p.time)}</span>
        )}
      </span>
    </div>
  )
}

/** Whether the book comments of a position are wanted: `mine` when the last move was mine. */
function commentsFor(side: LiveCommentSide, mine: boolean): boolean {
  return side === 'both' || (side === 'mine' && mine) || (side === 'opponent' && !mine)
}

/** A game of the books as PGN with its players, to open it in the study. */
function bookGamePgn(g: BookGame): string {
  const tags = [['White', g.white ?? '?'], ['Black', g.black ?? '?'], ['Result', g.result || '*'], ...(g.event ? [['Event', g.event]] : []), ...(g.full.fen ? [['SetUp', '1'], ['FEN', g.full.fen]] : [])]
  return `${tags.map(([k, v]) => `[${k} "${v.replace(/"/g, "'")}"]`).join('\n')}\n\n${g.full.commented ?? g.full.pgn}`
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
  const prefs = usePlayPrefs()
  // The colours of each piece's moves, computed piece by piece while I think (S14.4).
  const [pre, setPre] = useState<{ fen: string; hints: Record<string, Record<string, MoveHint>> }>({ fen: '', hints: {} })
  useEffect(() => {
    if (!settings.playMoveHints || !myTurn) return
    let live = true
    const fen = p.fen
    setPre({ fen, hints: {} })
    void precomputeHints(playAnalyse, fen, (square, h) => {
      if (live) setPre((prev) => (prev.fen === fen ? { fen, hints: { ...prev.hints, [square]: h } } : prev))
    }, () => live).catch(() => undefined)
    return () => { live = false }
  }, [p.fen, myTurn, settings.playMoveHints])
  const preHints = selected && pre.fen === p.fen ? pre.hints[selected] : undefined
  const lateHints = useMoveHints(p.fen, selected, settings.playMoveHints && myTurn && !preHints)
  const hints = preHints ?? lateHints
  // Book comments for the position, after both sides' moves or one side's (S14.2).
  const [comments, setComments] = useState<{ fen: string; list: HumanComment[] }>({ fen: '', list: [] })
  const lastMover: 'white' | 'black' = p.fen.split(' ')[1] === 'w' ? 'black' : 'white'
  const commentsWanted = commentsFor(prefs.liveComments, p.mode === 'human' || lastMover === p.color)
  useEffect(() => {
    if (p.status === 'idle' || !p.sans.length || !commentsWanted) return
    let live = true
    const fen = p.fen
    void lookupPositionComments(fen).then((list) => { if (live) setComments({ fen, list }) }, () => undefined)
    return () => { live = false }
  }, [p.fen, p.status, p.sans.length, commentsWanted])
  const liveComments = commentsWanted && comments.fen === p.fen
    ? [...comments.list].sort((a, b) => Number(b.lang === lang) - Number(a.lang === lang)).slice(0, 3) : []
  // What the grandmasters of the books played from here (S14.1).
  const [index, setIndex] = useState<PositionIndex | null>(null)
  useEffect(() => {
    if (!prefs.gmMoves || p.status === 'idle' || index) return
    let live = true
    void loadPositionIndex().then((i) => { if (live) setIndex(i) }, () => undefined)
    return () => { live = false }
  }, [prefs.gmMoves, p.status, index])
  const candidates = prefs.gmMoves && index && p.status !== 'idle' ? bookCandidates(index, p.fen).slice(0, 5) : []
  const [gmEval, setGmEval] = useState<{ fen: string; scores: Record<string, PieceMove> }>({ fen: '', scores: {} })
  const candidateKey = candidates.map((c) => c.san).join(' ')
  useEffect(() => {
    if (!candidateKey || !myTurn) return
    let live = true
    const fen = p.fen
    void analyseSans(playAnalyse, fen, candidateKey.split(' ')).then((scores) => { if (live) setGmEval({ fen, scores }) }, () => undefined)
    return () => { live = false }
  }, [candidateKey, p.fen, myTurn])
  // A tutor idea is shown on the board for a moment; hovering its moves or squares shows them (S14.3).
  const [flash, setFlash] = useState<CueBoard | null>(null)
  const [hover, setHover] = useState<CueBoard | null>(null)
  const lastNote = p.log[p.log.length - 1]
  useEffect(() => {
    if (!lastNote?.fen || lastNote.fen !== usePlayStore.getState().fen) return
    const board = ideaCues(lastNote.text, lastNote.fen, lang)
    if (!board.arrows.length && !Object.keys(board.squareStyles).length) return
    setFlash(board)
    const id = setTimeout(() => setFlash(null), 3500)
    return () => clearTimeout(id)
  }, [lastNote, lang])
  // The tutor panel follows the latest entry (S14.7).
  const tutorRef = useRef<HTMLElement>(null)
  useEffect(() => {
    const el = tutorRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [p.log])
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
  const notationStyle = useSettingsStore((s) => s.notationStyle)
  // Traps by position (S15): on my turn, the moves that lead into a position of one of my traps, whatever the move order.
  const toMoveIsMe = p.fen.split(' ')[1] === (p.color === 'white' ? 'w' : 'b')
  const trapMoves = ideas && toMoveIsMe ? trapContinuations(p.fen, traps.filter((x) => x.side === p.color)).slice(0, 4) : []
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
    const mine = !!piece && piece.color === p.fen.split(' ')[1]
    setSelected(mine ? square : null)
    // Touching a piece: the tutor writes what moving it implies (S14.8).
    if (mine && square !== selected && myTurn && prefs.explainTouch) {
      const fen = p.fen
      void analyseMoves(playAnalyse, fen, square).then((moves) => {
        if (usePlayStore.getState().fen === fen) usePlayStore.getState().addNote('tutor', describePiece(moves, fen, square, lang), fen, false)
      }, () => undefined)
    }
  }
  const field = 'max-w-full rounded border border-slate-300 bg-white px-2 py-1 text-sm'
  const check = 'flex items-center gap-1.5 text-xs text-slate-700'

  const squareStyles: Record<string, CSSProperties> = {}
  for (const target of ideas?.targets ?? []) {
    squareStyles[target.square] = { boxShadow: 'inset 0 0 0 3px rgba(234, 88, 12, 0.8)' }
  }
  // The squares of a tutor idea, under the colours of the chosen piece's moves.
  const cue = hover ?? flash
  if (cue) Object.assign(squareStyles, cue.squareStyles)
  for (const [square, hint] of Object.entries(hints)) {
    const c = HINT_COLOR[hint]
    squareStyles[square] = { background: `radial-gradient(circle, ${c} 0 30%, transparent 32%)`, boxShadow: `inset 0 0 0 3px ${c}` }
  }
  const think = p.think ? thinkingNow(p.think, nowTick) : null
  const orientation = p.mode === 'human' ? 'white' : p.color
  const showLegend = settings.playMoveHints && settings.playLegend && p.status !== 'idle' && p.sans.length < 10
  const j = p.judgement
  const kindOf = new Map(p.judgements.map((x) => [x.ply, x.kind]))
  const top: 'white' | 'black' = orientation === 'white' ? 'black' : 'white'
  const row = (side: 'white' | 'black') =>
    p.players && (
      <PlayerRow side={side} player={p.players[side]} label={side === 'white' ? t.white : t.black}
        time={ticking?.[side]} running={p.clocks?.running === side} think={think?.[side]} thinkLabel={t.thinkTime} />
    )

  const showBar = settings.playEvalBar && p.status !== 'idle'
  const barAt = (pos: EvalBarPosition) => showBar && prefs.evalBarPosition === pos
  // Like the training boards' bar: a narrow column stretched to the board's height, with room for the score below.
  const sideBar = (
    <div data-testid="play-eval-bar" className="flex w-3 shrink-0 justify-center self-stretch pb-3">
      <EvalBar fen={p.fen} direction="vertical" />
    </div>
  )
  const collapsed = prefs.configCollapsed

  return (
    <div className={`mx-auto flex ${pageWidth} flex-col gap-4 px-4 py-6 md:flex-row`}>
      <div className="w-full max-w-[520px]">
        {row(top)}
        {barAt('top') && <div data-testid="play-eval-bar" className="my-1 w-full"><EvalBar fen={p.fen} direction="horizontal" /></div>}
        {/* The board stays square; a side bar takes the board's height beside it (S12). */}
        <div className="my-1 flex items-start gap-1.5">
          {barAt('left') && sideBar}
          <div data-testid="play-board-square" className="aspect-square min-w-0 flex-1">
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
              arrows={cue?.arrows ?? []}
            />
          </div>
          {barAt('right') && sideBar}
        </div>
        {barAt('bottom') && <div data-testid="play-eval-bar" className="my-1 w-full"><EvalBar fen={p.fen} direction="horizontal" /></div>}
        {row(top === 'white' ? 'black' : 'white')}
        {p.gameInfo && (
          <a className="mt-1 block text-xs text-blue-700 underline" href={p.gameInfo.url} target="_blank" rel="noreferrer">
            Lichess: {p.gameInfo.speed} · {p.gameInfo.rated ? t.rated : t.casual}
          </a>
        )}
        {p.sans.length > 0 && (
          <OpenInStudy title={p.players ? `${p.players.white.name} – ${p.players.black.name}` : 'Game'} load={() => Promise.resolve(gamePgn(p.sans, p.players))} />
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
        {ideas && (ideas.opening || ideas.targets.length > 0 || ideas.chances.length > 0 || trapHere.length > 0 || trapMoves.length > 0) && (
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
            {trapMoves.length > 0 && (
              <p data-testid="play-trap-moves">🪤 {t.trapMoves}: {trapMoves.map((m) => `${formatSan(m.san, lang, notationStyle)} (${m.traps.slice(0, 2).map((x) => (lang === 'es' && x.titleEs ? x.titleEs : x.title)).join(', ')})`).join(' · ')}</p>
            )}
            <InfoSection topic="ideas" opening={ideas.opening} themes={lastThemes}
              idea={trapHere.map(({ trap }) => (lang === 'es' && trap.introEs ? trap.introEs : trap.intro)).join(' ') || undefined} testId="play-info" />
          </div>
        )}
        {humanHere && humanHere.moves.length > 0 && (
          <p data-testid="human-moves" className="mt-1 text-sm text-slate-700">
            🧑 {t.humanSays(humanHere.rating)} {humanHere.moves.map((m) => `${m.san} (${Math.round(m.probability * 100)}%)`).join(', ')}
          </p>
        )}
        {candidates.length > 0 && (
          <section data-testid="gm-moves" aria-label={t.gmTitle} className="mt-2 rounded border border-emerald-200 bg-emerald-50 p-2 text-xs text-emerald-950">
            <h3 className="font-semibold">♟ {t.gmTitle}</h3>
            <ul className="mt-1 flex flex-col gap-1">
              {candidates.map((c) => {
                const ev = gmEval.fen === p.fen ? gmEval.scores[c.san] : undefined
                const total = candidates.reduce((n, x) => n + x.count, 0)
                return (
                  <li key={c.san}>
                    <strong>{localSan(c.san, lang)}</strong> · {t.games(c.count)} ({Math.round((c.count / total) * 100)}%)
                    {ev ? ` · ${formatScore(ev, lang)}` : ''}
                    <ul className="ml-4">
                      {c.games.slice(0, 3).map((g) => (
                        <li key={g.gameId} className="flex flex-wrap items-center gap-x-2">
                          <span>{g.white ?? '?'} – {g.black ?? '?'} {g.result}{g.termination ? ` (${g.termination})` : ''}{g.year ? `, ${g.year}` : ''}</span>
                          <OpenInStudy title={`${g.white ?? '?'} – ${g.black ?? '?'}`} load={() => Promise.resolve(bookGamePgn(g))} />
                        </li>
                      ))}
                    </ul>
                  </li>
                )
              })}
            </ul>
          </section>
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
        <div className="flex items-center justify-between gap-2">
          <h1 className="text-xl font-bold text-slate-800">{t.title}</h1>
          <button type="button" aria-expanded={!collapsed} aria-controls="play-config" onClick={() => prefs.set({ configCollapsed: !collapsed })}
            className="flex items-center gap-1 rounded border border-slate-300 bg-white px-2 py-0.5 text-xs text-slate-700 hover:bg-slate-50">
            <span aria-hidden="true">{collapsed ? '▸' : '▾'}</span>{t.config}
          </button>
        </div>
        {!collapsed && (
          <div id="play-config" className="flex flex-col gap-3">
            <div className="flex flex-wrap items-end gap-2">
              <label className="flex max-w-full flex-col text-xs text-slate-600">{t.mode}
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
                <label className="flex max-w-full flex-col text-xs text-slate-600">{t.color}
                  <select aria-label={t.color} className={field} value={color} onChange={(e) => setColor(e.target.value as 'white' | 'black' | 'random')}>
                    <option value="white">{t.white}</option>
                    <option value="black">{t.black}</option>
                    <option value="random">{t.random}</option>
                  </select>
                </label>
              )}
              {(mode === 'engine' || mode === 'lichess-ai' || (mode === 'server' && !serverEngine.startsWith('maia'))) && (
                <label className="flex max-w-full flex-col text-xs text-slate-600">{t.strength} ({strength}/8)
                  <input aria-label={t.strength} type="range" min={1} max={8} value={strength} onChange={(e) => setStrength(Number(e.target.value))} />
                </label>
              )}
              {mode === 'server' && (
                <label className="flex max-w-full flex-col text-xs text-slate-600">{t.engineName}
                  <select aria-label={t.engineName} className={field} value={serverEngine} onChange={(e) => setServerEngine(e.target.value)}>
                    {serverEngines.map((e) => <option key={e.id} value={e.id} title={e.style}>{e.name}</option>)}
                  </select>
                </label>
              )}
              {mode === 'lichess-bot' && (
                <label className="flex max-w-full flex-col text-xs text-slate-600">{t.bot}
                  <select aria-label={t.bot} className={field} value={bot} onChange={(e) => setBot(e.target.value)}>
                    {LICHESS_BOTS.map((b) => <option key={b.id} value={b.id}>{b.label}</option>)}
                  </select>
                </label>
              )}
              {online && (
                <label className="flex max-w-full flex-col text-xs text-slate-600">{t.clock}
                  <select aria-label={t.clock} className={field} value={clock} onChange={(e) => setClock(e.target.value)}>
                    {LICHESS_CLOCKS.map((c) => <option key={`${c.minutes}+${c.increment}`} value={`${c.minutes}+${c.increment}`}>{c.minutes}+{c.increment}</option>)}
                  </select>
                </label>
              )}
              {online && (
                <p className="flex max-w-full flex-col text-xs text-slate-600">
                  {token ? '✓ Lichess token (Settings → Accounts)' : t.token}
                  {!token && <a className="text-blue-700 underline" href={LICHESS_PLAY_TOKEN_URL} target="_blank" rel="noreferrer">{t.create}</a>}
                </p>
              )}
            </div>
            <fieldset className="flex flex-wrap gap-x-4 gap-y-1.5 rounded border border-slate-200 bg-white p-2">
              <legend className="px-1 text-xs font-semibold text-slate-700">{t.options}</legend>
              <label className={check}><input type="checkbox" checked={settings.playMoveHints} onChange={(e) => settings.set({ playMoveHints: e.target.checked })} />{t.hints}</label>
              <label className={check}><input type="checkbox" checked={settings.playLegend} onChange={(e) => settings.set({ playLegend: e.target.checked })} />{t.legend}</label>
              <label className={check}><input type="checkbox" checked={settings.playMoveStatus} onChange={(e) => settings.set({ playMoveStatus: e.target.checked })} />{t.status}</label>
              <label className={check}><input type="checkbox" checked={settings.playIdeas} onChange={(e) => settings.set({ playIdeas: e.target.checked })} />{t.ideas}</label>
              <label className={check}><input type="checkbox" checked={settings.playEvalBar} onChange={(e) => settings.set({ playEvalBar: e.target.checked })} />{t.bar}</label>
              <label className={check}>{t.barPosition}
                <select aria-label={t.barPosition} className="rounded border border-slate-300 bg-white px-1 py-0.5" value={prefs.evalBarPosition} onChange={(e) => prefs.set({ evalBarPosition: e.target.value as EvalBarPosition })}>
                  {(['left', 'right', 'top', 'bottom'] as const).map((pos) => <option key={pos} value={pos}>{t.barPositions[pos]}</option>)}
                </select>
              </label>
              <label className={check}>
                <input type="checkbox" checked={settings.playHumanHint} onChange={(e) => settings.set({ playHumanHint: e.target.checked })} />{t.humanHint}
                <select aria-label="Maia rating" className="rounded border border-slate-300 bg-white px-1 py-0.5" value={settings.playHumanRating} onChange={(e) => settings.set({ playHumanRating: Number(e.target.value) })}>
                  {[1100, 1200, 1300, 1400, 1500, 1600, 1700, 1800, 1900].map((r) => <option key={r} value={r}>{r}</option>)}
                </select>
              </label>
              <label className={check}><input type="checkbox" checked={prefs.explainTouch} onChange={(e) => prefs.set({ explainTouch: e.target.checked })} />{t.explainTouch}</label>
              <label className={check}><input type="checkbox" checked={prefs.positionComments} onChange={(e) => prefs.set({ positionComments: e.target.checked })} />{t.positionComments}</label>
              <label className={check}><input type="checkbox" checked={prefs.gmMoves} onChange={(e) => prefs.set({ gmMoves: e.target.checked })} />{t.gm}</label>
              <label className={check}>{t.liveComments}
                <select aria-label={t.liveComments} className="rounded border border-slate-300 bg-white px-1 py-0.5" value={prefs.liveComments} onChange={(e) => prefs.set({ liveComments: e.target.value as LiveCommentSide })}>
                  <option value="off">{t.lcOff}</option>
                  <option value="both">{t.lcBoth}</option>
                  <option value="mine">{t.lcMine}</option>
                  <option value="opponent">{t.lcOpp}</option>
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
          </div>
        )}
        <div className="flex flex-wrap items-end gap-2">
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
        {p.error && <p role="alert" className="rounded border border-red-300 bg-red-50 px-2 py-1 text-sm text-red-800">{p.error}</p>}
        {prefs.positionComments && p.status !== 'idle' && <PositionComments fen={p.fen} />}
        {!prefs.positionComments && liveComments.length > 0 && (
          <section data-testid="live-comments" aria-label={t.commentsTitle} className="flex flex-col gap-1 rounded border border-sky-200 bg-sky-50 p-2 text-sm text-sky-950">
            <h2 className="text-sm font-semibold">📚 {t.commentsTitle}</h2>
            {liveComments.map((c, i) => (
              <p key={i}>{commentInNotation(commentTextFor(c, lang), lang, figurinesOn(settings))} <span className="text-xs text-sky-700">— {commentSource(c)}</span></p>
            ))}
          </section>
        )}
        <section ref={tutorRef} aria-label={t.tutor} style={{ height: prefs.tutorHeight }} className="flex flex-col gap-1 overflow-y-auto scroll-smooth rounded border border-slate-200 bg-white p-2">
          <h2 className="sticky top-0 bg-white text-sm font-semibold text-slate-700">🎓 {t.tutor}</h2>
          {p.log.map((n, i) => (
            <p key={`${i}-${n.count ?? 1}`} style={n.count ? { animation: 'cue-blink 0.6s ease-in-out 3' } : undefined}
              className={`text-sm ${n.who === 'tutor' ? 'text-indigo-800' : n.who === 'opponent' ? 'text-rose-800' : 'text-slate-800'}`}>
              <span className="mr-1 text-xs text-slate-400">{Math.ceil(n.ply / 2)}.</span>
              {n.who === 'opponent' ? `${t.opp}: ` : ''}
              {n.fen ? ideaSegments(n.text, n.fen, lang).map((seg, k) => seg.board ? (
                <span key={k} tabIndex={0} className="cursor-help underline decoration-dotted underline-offset-2"
                  onMouseEnter={() => setHover(seg.board!)} onMouseLeave={() => setHover(null)}
                  onFocus={() => setHover(seg.board!)} onBlur={() => setHover(null)}>{seg.text}</span>
              ) : <span key={k}>{seg.text}</span>) : n.text}
              {n.count ? <> <strong className="text-xs">({n.count}x)</strong></> : null}
            </p>
          ))}
        </section>
        <TutorResizeHandle height={prefs.tutorHeight} label={t.resizeTutor} onChange={(tutorHeight) => prefs.set({ tutorHeight })} />
      </div>
    </div>
  )
}
