import { create } from 'zustand'
import { Chess } from 'chess.js'
import { explainMove, opponentIntent, opportunities, sanToSpeech, type Lang, type Score } from '@chess-ebook/chess-shared'
import { createEngineAnalyser, type AnalysePosition } from '../library/review/reviewEngine'
import { engineMove } from './enginePlayer'
import {
  lichessChallengeAi, lichessChallengeBot, lichessEvents, lichessGameStream, lichessMakeMove, lichessResign, lichessSeek, LICHESS_CLOCKS,
  type LichessGameFull, type LichessGameState, type LichessPlayer,
} from './lichessBoard'
import { useSettingsStore, STOCKFISH_VERSIONS } from '../../shared/settings/settingsStore'
import { httpClient } from '../../shared/api/httpClient'
import { browserSpeaker } from '../library/narration/speaker'
import { judgeByEngine, judgeByTablebase, lichessTablebase, type MoveJudgement } from './moveJudge'
import { bookMove } from './openingBook'
import { appendNote } from './tutorLog'
import { startThinking, switchThinking, type ThinkTimes } from './thinkTime'

/**
 * A game played on this board — against the engine (chosen strength), against
 * a person sitting at the same board, or against someone on Lichess (casual) —
 * with a tutor that speaks after every move: the idea of the move, what the
 * opponent is up to, what the move leaves to the opponent and the chances the
 * side to move has.
 */
export type PlayMode = 'engine' | 'human' | 'lichess' | 'lichess-ai' | 'lichess-bot' | 'server'
export type Clock = { minutes: number; increment: number }
export interface TutorNote {
  ply: number
  who: 'you' | 'opponent' | 'tutor'
  text: string
  /** The position the note talks about (its moves and squares can be shown there). */
  fen?: string
  /** How many times in a row the same note was written (S14.5). */
  count?: number
}

interface Runtime { analyse: AnalysePosition }
let runtime: Runtime | null = null
let runtimeUrl = ''
let injected = false
/** The engine of the game: the Stockfish version chosen in Settings. */
const engine = () => {
  const url = STOCKFISH_VERSIONS[useSettingsStore.getState().stockfishVersion]?.url ?? ''
  if (!injected && (!runtime || runtimeUrl !== url)) { runtime = { analyse: createEngineAnalyser(url || undefined).analyse }; runtimeUrl = url }
  return runtime!
}
export function setPlayRuntime(next: Runtime) { runtime = next; injected = true }
/** The game's engine, for the study tools of the page (hints, touched piece, book moves). */
export const playAnalyse: AnalysePosition = (fen, depth, count) => engine().analyse(fen, depth, count)

type Say = (text: string, lang: Lang) => void
let speaker: { speak: (t: string, l: Lang, r: number) => Promise<void> } | null = null
let say: Say = (text, lang) => { speaker ??= browserSpeaker(); void speaker.speak(text, lang, 1) }
/** Swap the voice (tests). */
export function setPlaySpeaker(fn: Say) { say = fn }

export interface PlayerInfo { name: string; rating?: number; title?: string }
export interface Clocks { white: number; black: number; increment: number; at: number; running: 'white' | 'black' | null }
export interface Judged extends MoveJudgement { ply: number; san: string }

const JUDGE_DEPTH = 10

function playerInfo(p: LichessPlayer): PlayerInfo {
  return {
    name: p.name ?? (p.aiLevel ? `Lichess AI level ${p.aiLevel}` : '?'),
    ...(p.rating ? { rating: p.rating } : {}),
    ...(p.title ? { title: p.title } : {}),
  }
}

interface PlayState {
  mode: PlayMode
  color: 'white' | 'black'
  strength: number
  lang: Lang
  fen: string
  sans: string[]
  lastMove: { from: string; to: string } | null
  log: TutorNote[]
  status: 'idle' | 'playing' | 'thinking' | 'seeking' | 'over'
  result: string
  error: string | null
  lichess: { token: string; gameId: string | null } | null
  /** Who plays White and Black (names, ratings, titles as Lichess gives them). */
  players: { white: PlayerInfo; black: PlayerInfo } | null
  /** Time left in milliseconds at `at`, on Lichess games. */
  clocks: Clocks | null
  gameInfo: { speed: string; rated: boolean; url: string } | null
  /** The last judged move: book, best, good, inaccuracy, mistake or blunder. */
  judgement: Judged | null
  /** Every judged move by ply, for the move list. */
  judgements: Judged[]
  /** Increases with every new game: a late answer for an old game is dropped. */
  gameId: number
  /** 'server' mode: the engine on the server that plays (stockfish, maia-1500, gnuchess…). */
  serverEngine: string | null
  /** Thinking time of both players, in every game (S14.6). */
  think: ThinkTimes | null
  /** Write a note in the tutor panel (a repeated one is counted, not repeated). */
  addNote: (who: TutorNote['who'], text: string, fen?: string, speak?: boolean) => void
  start: (o: { mode: PlayMode; color: 'white' | 'black'; strength: number; lang: Lang; token?: string; clock?: Clock; bot?: string; serverEngine?: string }) => void
  resign: () => void
  /** The user's move on the board; false when it is not theirs or not legal. */
  move: (from: string, to: string, promotion?: string) => boolean
  reset: () => void
}

let chess = new Chess()
let abort: AbortController | null = null
const START = new Chess().fen()
const T = {
  es: { leaves: 'Cuidado, tu jugada le deja al rival esto:', your: 'Tu jugada:', chance: 'Oportunidad:', mated: 'Jaque mate.', draw: 'Tablas.', seeking: 'Buscando rival en Lichess…', resigned: 'Abandonaste.' },
  en: { leaves: 'Careful, your move leaves the opponent this:', your: 'Your move:', chance: 'Chance:', mated: 'Checkmate.', draw: 'Draw.', seeking: 'Looking for an opponent on Lichess…', resigned: 'You resigned.' },
  de: { leaves: 'Vorsicht, dein Zug erlaubt dem Gegner:', your: 'Dein Zug:', chance: 'Chance:', mated: 'Schachmatt.', draw: 'Remis.', seeking: 'Suche Gegner auf Lichess…', resigned: 'Du hast aufgegeben.' },
}

export const usePlayStore = create<PlayState>((set, get) => {
  const note = (who: TutorNote['who'], text: string, fen = chess.fen(), speak = true) => {
    set({ log: appendNote(get().log, { ply: chess.history().length, who, text, fen }) })
    // The tutor's ideas are said aloud when the voice is on (S14.3).
    if (speak && who === 'tutor' && useSettingsStore.getState().playVoice !== 'none') say(text, get().lang)
  }

  /** Apply a move (UCI or from/to) and let the tutor speak about it. */
  function apply(from: string, to: string, promotion: string | undefined, byUser: boolean): boolean {
    const before = chess.fen()
    let mv
    try { mv = chess.move({ from, to, promotion: promotion ?? 'q' }) } catch { return false }
    const { lang, mode } = get()
    const t = T[lang]
    set({ fen: chess.fen(), sans: chess.history(), lastMove: { from, to } })
    const think = get().think
    if (think) set({ think: switchThinking(think, Date.now(), chess.isGameOver()) })
    const settings = useSettingsStore.getState()
    const opponents = !byUser && mode !== 'human'
    if (settings.playVoice === 'both' || (settings.playVoice === 'opponent' && opponents)) say(sanToSpeech(mv.san, lang), lang)
    if (settings.playMoveStatus && (byUser || mode === 'human')) void judge(before, `${mv.from}${mv.to}${mv.promotion ?? ''}`, chess.fen(), mv.san, chess.history().length)
    const two = mode === 'human'
    const ideas = byUser || two ? explainMove(before, mv.san, lang) : opponentIntent(before, mv.san, lang)
    if (ideas.length) note(byUser || two ? 'you' : 'opponent', (byUser ? `${t.your} ` : '') + ideas.join(' '), before)
    if (chess.isGameOver()) {
      set({ status: 'over', result: chess.isCheckmate() ? t.mated : t.draw })
      note('tutor', chess.isCheckmate() ? t.mated : t.draw)
      return true
    }
    // What the side to move can do now: a warning for the mover, a chance for the other.
    const chances = opportunities(chess.fen(), lang)
    if (chances.length) {
      if (byUser && !two) note('tutor', `${t.leaves} ${chances[0].text}`)
      else if (!byUser || two) note('tutor', chances.map((c) => c.text).join(' '))
    }
    return true
  }

  /** Judge a played move: book first, then the endgame tablebase, then the engine. */
  async function judge(fenBefore: string, uci: string, fenAfter: string, san: string, ply: number) {
    const game = get().gameId
    const mover = fenBefore.split(' ')[1] as 'w' | 'b'
    let verdict: MoveJudgement | null = null
    const token = useSettingsStore.getState().lichessToken || undefined
    const book = ply <= 30 ? await bookMove(fenBefore, uci, fenAfter, token) : null
    if (book) verdict = { kind: 'book', loss: 0, opening: book.eco ? `${book.name} (${book.eco})` : book.name }
    if (!verdict) {
      const tb = await lichessTablebase(fenBefore).catch(() => null)
      if (tb) verdict = judgeByTablebase(tb, uci)
    }
    if (!verdict) {
      const whiteScore = (lines: { scoreCp?: number; mate?: number }[], fen: string): Score => {
        const l = lines[0]
        const sign = fen.split(' ')[1] === 'w' ? 1 : -1
        if (!l) return { cp: 0 }
        return l.mate !== undefined ? { mate: sign * l.mate } : { cp: sign * (l.scoreCp ?? 0) }
      }
      const done = new Chess(fenAfter)
      const best = await engine().analyse(fenBefore, JUDGE_DEPTH, 1)
      const after: Score = done.isCheckmate() ? { mate: mover === 'w' ? 1 : -1 } : done.isGameOver() ? { cp: 0 } : whiteScore(await engine().analyse(fenAfter, JUDGE_DEPTH, 1), fenAfter)
      verdict = judgeByEngine(whiteScore(best, fenBefore), after, mover, best[0]?.pv[0] === uci)
    }
    if (get().gameId !== game) return
    const judged: Judged = { ...verdict, ply, san }
    set({ judgement: judged, judgements: [...get().judgements.filter((j) => j.ply !== ply), judged] })
  }

  async function engineTurn() {
    set({ status: 'thinking' })
    const { mode, serverEngine, strength } = get()
    const uci = mode === 'server' && serverEngine
      ? await httpClient<{ move: string }>(`/api/engine/play?engine=${encodeURIComponent(serverEngine)}&fen=${encodeURIComponent(chess.fen())}&level=${strength}`, { method: 'GET' }).then((r) => r.move, (e: Error) => { set({ error: e.message }); return null })
      : await engineMove(engine().analyse, chess.fen(), strength)
    if (get().status !== 'thinking') return
    if (uci) apply(uci.slice(0, 2), uci.slice(2, 4), uci[4], false)
    if (get().status === 'thinking') set({ status: 'playing' })
  }

  /** Follow a started Lichess game: its moves come by the stream, the result ends it. */
  function followLichess(token: string, gameId: string, color: 'white' | 'black', signal: AbortSignal) {
    chess = new Chess()
    set({ lichess: { token, gameId }, color, status: 'playing', fen: START, sans: [], think: startThinking('white', Date.now()) })
    const onState = (s: LichessGameState) => {
      const uci = s.moves ? s.moves.split(' ') : []
      // Moves arrive as the whole list: play the ones not on the board yet.
      for (const m of uci.slice(chess.history().length)) apply(m.slice(0, 2), m.slice(2, 4), m[4], false)
      if (s.wtime !== undefined && s.btime !== undefined) {
        const over = s.status !== 'started' && s.status !== 'created'
        set({ clocks: { white: s.wtime, black: s.btime, increment: s.winc ?? 0, at: Date.now(), running: over || uci.length < 2 ? null : chess.turn() === 'w' ? 'white' : 'black' } })
      }
      if (s.status !== 'started' && s.status !== 'created') {
        const think = get().think
        set({ status: 'over', result: s.winner ? `${s.winner} wins` : s.status, ...(think ? { think: switchThinking(think, Date.now(), true) } : {}) })
      }
    }
    const onFull = (g: LichessGameFull) => {
      set({
        players: { white: playerInfo(g.white ?? {}), black: playerInfo(g.black ?? {}) },
        gameInfo: { speed: g.speed ?? '', rated: !!g.rated, url: `https://lichess.org/${g.id}` },
      })
    }
    void lichessGameStream(token, gameId, onState, signal, onFull).catch((err) => { if (!signal.aborted) set({ error: String(err.message ?? err) }) })
  }

  /** Challenge a Lichess bot and follow the game once it accepts. */
  async function lichessBot(token: string, bot: string, clock: Clock) {
    abort = new AbortController()
    const signal = abort.signal
    const { color } = get()
    set({ status: 'seeking' })
    void lichessEvents(token, (e) => {
      if (e.type !== 'gameStart' || !e.game) return
      followLichess(token, e.game.gameId, e.game.color, signal)
    }, signal).catch((err) => { if (!signal.aborted) set({ error: String(err.message ?? err), status: 'idle' }) })
    lichessChallengeBot(token, bot, { clock, color }).catch((err) => { if (!signal.aborted) set({ error: String(err.message ?? err), status: 'idle' }) })
  }

  async function lichessGame(token: string, clock: Clock) {
    abort = new AbortController()
    const signal = abort.signal
    set({ status: 'seeking' })
    note('tutor', T[get().lang].seeking)
    void lichessEvents(token, (e) => {
      if (e.type !== 'gameStart' || !e.game) return
      followLichess(token, e.game.gameId, e.game.color, signal)
    }, signal).catch((err) => { if (!signal.aborted) set({ error: String(err.message ?? err), status: 'idle' }) })
    lichessSeek(token, clock, signal).catch((err) => { if (!signal.aborted) set({ error: String(err.message ?? err), status: 'idle' }) })
  }

  async function lichessAi(token: string, clock: Clock) {
    abort = new AbortController()
    const signal = abort.signal
    const { color, strength } = get()
    set({ status: 'seeking' })
    try {
      const gameId = await lichessChallengeAi(token, { level: strength, clock, color })
      if (!signal.aborted) followLichess(token, gameId, color, signal)
    } catch (err) {
      if (!signal.aborted) set({ error: String((err as Error).message ?? err), status: 'idle' })
    }
  }

  return {
    mode: 'engine', color: 'white', strength: 3, lang: 'en', fen: START, sans: [], lastMove: null, log: [],
    status: 'idle', result: '', error: null, lichess: null, serverEngine: null, players: null, clocks: null, gameInfo: null, judgement: null, judgements: [], gameId: 0, think: null,
    addNote: (who, text, fen, speak) => note(who, text, fen ?? chess.fen(), speak ?? true),
    start: (o) => {
      abort?.abort()
      chess = new Chess()
      // Lichess games learn their players from the game stream.
      const me = { name: o.lang === 'es' ? 'Tú' : o.lang === 'de' ? 'Du' : 'You' }
      const sf = { name: `Stockfish (${o.strength}/8)` }
      const opponent = o.mode === 'server' ? { name: o.serverEngine ?? 'Engine' } : sf
      const players = o.mode === 'engine' || o.mode === 'server'
        ? (o.color === 'white' ? { white: me, black: opponent } : { white: opponent, black: me })
        : o.mode === 'human' ? { white: me, black: me } : null
      set({ mode: o.mode, color: o.color, strength: o.strength, lang: o.lang, fen: START, sans: [], lastMove: null, log: [], status: 'playing', result: '', error: null, lichess: null,
        players, clocks: null, gameInfo: null, judgement: null, judgements: [], gameId: get().gameId + 1, serverEngine: o.serverEngine ?? null,
        think: o.mode === 'lichess' || o.mode === 'lichess-ai' || o.mode === 'lichess-bot' ? null : startThinking('white', Date.now()) })
      if (o.mode === 'lichess') { void lichessGame(o.token ?? '', o.clock ?? LICHESS_CLOCKS[0]); return }
      if (o.mode === 'lichess-ai') { void lichessAi(o.token ?? '', o.clock ?? LICHESS_CLOCKS[0]); return }
      if (o.mode === 'lichess-bot') { void lichessBot(o.token ?? '', o.bot ?? 'maia5', o.clock ?? LICHESS_CLOCKS[0]); return }
      if ((o.mode === 'engine' || o.mode === 'server') && o.color === 'black') void engineTurn()
    },
    move: (from, to, promotion) => {
      const s = get()
      if (s.status !== 'playing') return false
      const turn = chess.turn() === 'w' ? 'white' : 'black'
      if (s.mode !== 'human' && turn !== s.color) return false
      const before = chess.history().length
      if (!apply(from, to, promotion, true)) return false
      if ((s.mode === 'engine' || s.mode === 'server') && get().status === 'playing') void engineTurn()
      if ((s.mode === 'lichess' || s.mode === 'lichess-ai' || s.mode === 'lichess-bot') && s.lichess?.gameId) {
        const m = chess.history({ verbose: true })[before]
        lichessMakeMove(s.lichess.token, s.lichess.gameId, `${m.from}${m.to}${m.promotion ?? ''}`).catch((err) => set({ error: String(err.message ?? err) }))
      }
      return true
    },
    resign: () => {
      const s = get()
      if (s.lichess?.gameId) lichessResign(s.lichess.token, s.lichess.gameId).catch((err) => set({ error: String(err.message ?? err) }))
      else if (s.status === 'playing' || s.status === 'thinking') set({ status: 'over', result: T[s.lang].resigned, ...(s.think ? { think: switchThinking(s.think, Date.now(), true) } : {}) })
    },
    reset: () => {
      abort?.abort()
      chess = new Chess()
      set({ fen: START, sans: [], lastMove: null, log: [], status: 'idle', result: '', error: null, lichess: null, players: null, clocks: null, gameInfo: null, judgement: null, judgements: [], gameId: get().gameId + 1, think: null })
    },
  }
})
