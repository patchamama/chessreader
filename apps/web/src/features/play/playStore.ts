import { create } from 'zustand'
import { Chess } from 'chess.js'
import { explainMove, opponentIntent, opportunities, type Lang } from '@chess-ebook/chess-shared'
import { createEngineAnalyser, type AnalysePosition } from '../library/review/reviewEngine'
import { engineMove } from './enginePlayer'
import { lichessEvents, lichessGameStream, lichessMakeMove, lichessSeek } from './lichessBoard'

/**
 * A game played on this board — against the engine (chosen strength), against
 * a person sitting at the same board, or against someone on Lichess (casual) —
 * with a tutor that speaks after every move: the idea of the move, what the
 * opponent is up to, what the move leaves to the opponent and the chances the
 * side to move has.
 */
export type PlayMode = 'engine' | 'human' | 'lichess'
export interface TutorNote { ply: number; who: 'you' | 'opponent' | 'tutor'; text: string }

interface Runtime { analyse: AnalysePosition }
let runtime: Runtime | null = null
const engine = () => (runtime ??= { analyse: createEngineAnalyser().analyse })
export function setPlayRuntime(next: Runtime) { runtime = next }

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
  start: (o: { mode: PlayMode; color: 'white' | 'black'; strength: number; lang: Lang; token?: string }) => void
  /** The user's move on the board; false when it is not theirs or not legal. */
  move: (from: string, to: string, promotion?: string) => boolean
  reset: () => void
}

let chess = new Chess()
let abort: AbortController | null = null
const START = new Chess().fen()
const T = {
  es: { leaves: 'Cuidado, tu jugada le deja al rival esto:', your: 'Tu jugada:', chance: 'Oportunidad:', mated: 'Jaque mate.', draw: 'Tablas.', seeking: 'Buscando rival en Lichess…' },
  en: { leaves: 'Careful, your move leaves the opponent this:', your: 'Your move:', chance: 'Chance:', mated: 'Checkmate.', draw: 'Draw.', seeking: 'Looking for an opponent on Lichess…' },
  de: { leaves: 'Vorsicht, dein Zug erlaubt dem Gegner:', your: 'Dein Zug:', chance: 'Chance:', mated: 'Schachmatt.', draw: 'Remis.', seeking: 'Suche Gegner auf Lichess…' },
}

export const usePlayStore = create<PlayState>((set, get) => {
  const note = (who: TutorNote['who'], text: string) => set({ log: [...get().log, { ply: chess.history().length, who, text }] })

  /** Apply a move (UCI or from/to) and let the tutor speak about it. */
  function apply(from: string, to: string, promotion: string | undefined, byUser: boolean): boolean {
    const before = chess.fen()
    let mv
    try { mv = chess.move({ from, to, promotion: promotion ?? 'q' }) } catch { return false }
    const { lang, mode } = get()
    const t = T[lang]
    set({ fen: chess.fen(), sans: chess.history(), lastMove: { from, to } })
    const two = mode === 'human'
    const ideas = byUser || two ? explainMove(before, mv.san, lang) : opponentIntent(before, mv.san, lang)
    if (ideas.length) note(byUser || two ? 'you' : 'opponent', (byUser ? `${t.your} ` : '') + ideas.join(' '))
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

  async function engineTurn() {
    set({ status: 'thinking' })
    const uci = await engineMove(engine().analyse, chess.fen(), get().strength)
    if (get().status !== 'thinking') return
    if (uci) apply(uci.slice(0, 2), uci.slice(2, 4), uci[4], false)
    if (get().status === 'thinking') set({ status: 'playing' })
  }

  async function lichessGame(token: string) {
    abort = new AbortController()
    const signal = abort.signal
    set({ status: 'seeking' })
    note('tutor', T[get().lang].seeking)
    void lichessEvents(token, (e) => {
      if (e.type !== 'gameStart' || !e.game) return
      const { gameId, color } = e.game
      chess = new Chess()
      set({ lichess: { token, gameId }, color, status: 'playing', fen: START, sans: [] })
      void lichessGameStream(token, gameId, (s) => {
        const uci = s.moves ? s.moves.split(' ') : []
        // Moves arrive as the whole list: play the ones not on the board yet.
        for (const m of uci.slice(chess.history().length)) apply(m.slice(0, 2), m.slice(2, 4), m[4], false)
        if (s.status !== 'started' && s.status !== 'created') set({ status: 'over', result: s.winner ? `${s.winner} wins` : s.status })
      }, signal).catch((err) => set({ error: String(err.message ?? err) }))
    }, signal).catch((err) => { if (!signal.aborted) set({ error: String(err.message ?? err), status: 'idle' }) })
    lichessSeek(token, { minutes: 10, increment: 5 }, signal).catch((err) => { if (!signal.aborted) set({ error: String(err.message ?? err), status: 'idle' }) })
  }

  return {
    mode: 'engine', color: 'white', strength: 3, lang: 'en', fen: START, sans: [], lastMove: null, log: [],
    status: 'idle', result: '', error: null, lichess: null,
    start: (o) => {
      abort?.abort()
      chess = new Chess()
      set({ mode: o.mode, color: o.color, strength: o.strength, lang: o.lang, fen: START, sans: [], lastMove: null, log: [], status: 'playing', result: '', error: null, lichess: null })
      if (o.mode === 'lichess') { void lichessGame(o.token ?? ''); return }
      if (o.mode === 'engine' && o.color === 'black') void engineTurn()
    },
    move: (from, to, promotion) => {
      const s = get()
      if (s.status !== 'playing') return false
      const turn = chess.turn() === 'w' ? 'white' : 'black'
      if (s.mode !== 'human' && turn !== s.color) return false
      const before = chess.history().length
      if (!apply(from, to, promotion, true)) return false
      if (s.mode === 'engine' && get().status === 'playing') void engineTurn()
      if (s.mode === 'lichess' && s.lichess?.gameId) {
        const m = chess.history({ verbose: true })[before]
        lichessMakeMove(s.lichess.token, s.lichess.gameId, `${m.from}${m.to}${m.promotion ?? ''}`).catch((err) => set({ error: String(err.message ?? err) }))
      }
      return true
    },
    reset: () => {
      abort?.abort()
      chess = new Chess()
      set({ fen: START, sans: [], lastMove: null, log: [], status: 'idle', result: '', error: null, lichess: null })
    },
  }
})
