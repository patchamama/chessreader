import { Chess, type Square } from 'chess.js'
import { winPercent, type Lang } from '@chess-ebook/chess-shared'
import type { AnalysePosition } from '../library/review/reviewEngine'
import type { MoveHint } from '../library/review/reviewEngine'
import type { EngineLine } from '../../shared/stockfish/useEngineLines'
import { formatSan } from '../../shared/chess/notation'
import { useSettingsStore } from '../../shared/settings/settingsStore'

/** Low depth: the colours must be ready before the player picks a piece. */
export const PIECE_DEPTH = 6

/** SAN in the notation of Settings: figurines, or the letters of the language (C, A, T, D, R in Spanish). */
export function localSan(san: string, lang: Lang): string {
  return formatSan(san, lang, useSettingsStore.getState().notationStyle ?? 'letters')
}

/** One move of a piece as the engine sees it, from the mover's side. */
export interface PieceMove {
  uci: string
  san: string
  to: string
  /** Centipawns for the mover (a mate is a very large number). */
  cp: number
  mate?: number
  /** The opponent's best answer (English SAN), if any. */
  reply: string | null
}

const cache = new Map<string, Promise<PieceMove>>()
/** Test hook: forget what was analysed. */
export function clearPieceAnalysis() { cache.clear() }

const mateCp = (m: number) => (m > 0 ? 100000 - m : -100000 - m)

function scoreOf(line: EngineLine | undefined): { cp: number; mate?: number } {
  if (!line) return { cp: 0 }
  if (line.mate !== undefined) return { cp: mateCp(line.mate), mate: line.mate }
  return { cp: line.scoreCp ?? 0 }
}

function analyseOne(analyse: AnalysePosition, fen: string, mv: { from: string; to: string; promotion?: string; san: string }): Promise<PieceMove> {
  const uci = `${mv.from}${mv.to}${mv.promotion ?? ''}`
  const key = `${fen}|${uci}`
  let found = cache.get(key)
  if (!found) {
    found = (async () => {
      const after = new Chess(fen)
      after.move({ from: mv.from, to: mv.to, promotion: mv.promotion })
      if (after.isCheckmate()) return { uci, san: mv.san, to: mv.to, cp: mateCp(1), mate: 1, reply: null }
      if (after.isGameOver()) return { uci, san: mv.san, to: mv.to, cp: 0, reply: null }
      const lines = await analyse(after.fen(), PIECE_DEPTH, 1)
      const s = scoreOf(lines[0])
      let reply: string | null = null
      const r = lines[0]?.pv[0]
      if (r) { try { reply = after.move({ from: r.slice(0, 2), to: r.slice(2, 4), promotion: r[4] }).san } catch { reply = null } }
      return { uci, san: mv.san, to: mv.to, cp: -s.cp, ...(s.mate !== undefined ? { mate: -s.mate } : {}), reply }
    })()
    cache.set(key, found)
    found.catch(() => cache.delete(key))
    if (cache.size > 2000) cache.delete(cache.keys().next().value as string)
  }
  return found
}

/** Every move of the piece on `square` with its score and the opponent's best reply, best first (cached per position). */
export async function analyseMoves(analyse: AnalysePosition, fen: string, square: string): Promise<PieceMove[]> {
  let moves: { from: string; to: string; promotion?: string; san: string }[] = []
  try { moves = new Chess(fen).moves({ square: square as Square, verbose: true }) } catch { return [] }
  // One promotion per square (the queen) is enough to colour it.
  moves = moves.filter((m) => !m.promotion || m.promotion === 'q')
  const out = await Promise.all(moves.map((m) => analyseOne(analyse, fen, m)))
  return out.sort((a, b) => b.cp - a.cp)
}

const win = (cp: number) => winPercent({ cp })

/** The colour of each destination: what it loses against `bestCp` (the position's best, else the piece's best). */
export function hintsFromMoves(moves: PieceMove[], bestCp?: number): Record<string, MoveHint> {
  if (!moves.length) return {}
  const top = win(Math.max(bestCp ?? -Infinity, ...moves.map((m) => m.cp)))
  const out: Record<string, MoveHint> = {}
  for (const m of moves) {
    const loss = top - win(m.cp)
    const hint: MoveHint = loss < 5 ? 'good' : loss < 15 ? 'dubious' : 'bad'
    if (!out[m.to] || hint === 'good' || (hint === 'dubious' && out[m.to] === 'bad')) out[m.to] = hint
  }
  return out
}

const PIECE: Record<Lang, Record<string, string>> = {
  es: { p: 'Peón', n: 'Caballo', b: 'Alfil', r: 'Torre', q: 'Dama', k: 'Rey' },
  en: { p: 'Pawn', n: 'Knight', b: 'Bishop', r: 'Rook', q: 'Queen', k: 'King' },
  de: { p: 'Bauer', n: 'Springer', b: 'Läufer', r: 'Turm', q: 'Dame', k: 'König' },
}
const WORDS: Record<Lang, { on: string; reply: string; none: string; mate: string }> = {
  es: { on: 'de', reply: 'responde', none: 'no tiene jugadas.', mate: 'mate' },
  en: { on: 'on', reply: 'reply', none: 'has no moves.', mate: 'mate' },
  de: { on: 'auf', reply: 'Antwort', none: 'hat keine Züge.', mate: 'Matt' },
}

function score(m: PieceMove, lang: Lang): string {
  if (m.mate !== undefined) return `${m.mate > 0 ? '' : '−'}${WORDS[lang].mate} ${Math.abs(m.mate)}`
  const v = (m.cp / 100).toFixed(2)
  return m.cp >= 0 ? `+${v}` : `−${v.slice(1)}`
}

/** What moving the piece implies, for the tutor panel: its best destinations and the opponent's best reply after each. */
export function describePiece(moves: PieceMove[], fen: string, square: string, lang: Lang, max = 3): string {
  const piece = new Chess(fen).get(square as Square)
  const w = WORDS[lang]
  const head = `${piece ? PIECE[lang][piece.type] : '?'} ${w.on} ${square}`
  if (!moves.length) return `${head} ${w.none}`
  const parts = moves.slice(0, max).map((m) => `${localSan(m.san, lang)} (${score(m, lang)}${m.reply ? `, ${w.reply} ${localSan(m.reply, lang)}` : ''})`)
  return `${head}: ${parts.join(', ')}.`
}

/**
 * While the player thinks: the colours of each piece's destinations, piece by
 * piece, starting with the pieces of the engine's top moves (low depth).
 * `alive` stops the work as soon as the position is no longer current.
 */
export async function precomputeHints(
  analyse: AnalysePosition, fen: string,
  onPiece: (square: string, hints: Record<string, MoveHint>, moves: PieceMove[]) => void,
  alive: () => boolean, top = 5,
): Promise<void> {
  let legal: { from: string }[] = []
  try { legal = new Chess(fen).moves({ verbose: true }) } catch { return }
  if (!legal.length) return
  const lines = await analyse(fen, PIECE_DEPTH, Math.min(top, legal.length))
  if (!alive()) return
  const best = lines[0] ? scoreOf(lines[0]).cp : undefined
  const squares = [...new Set([...lines.map((l) => l.pv[0]?.slice(0, 2)).filter((s): s is string => !!s), ...legal.map((m) => m.from)])]
  for (const square of squares) {
    if (!alive()) return
    const moves = await analyseMoves(analyse, fen, square)
    if (!alive()) return
    onPiece(square, hintsFromMoves(moves, best), moves)
  }
}

/** The score of each named move (English SAN) from the mover's side, with the best reply (cached like the pieces). */
export async function analyseSans(analyse: AnalysePosition, fen: string, sans: string[]): Promise<Record<string, PieceMove>> {
  const out: Record<string, PieceMove> = {}
  await Promise.all(sans.map(async (san) => {
    try {
      const mv = new Chess(fen).move(san)
      out[san] = await analyseOne(analyse, fen, mv)
    } catch { /* not a move here */ }
  }))
  return out
}

/** A score for a short display: +0.30, −1.20, mate 3. */
export const formatScore = (m: PieceMove, lang: Lang) => score(m, lang)
