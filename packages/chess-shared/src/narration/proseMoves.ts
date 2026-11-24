import { Chess, type Move } from 'chess.js'
import type { BoardCue } from '../teaching/commentCues.js'
import { detectProseLang } from '../notation/proseReferences.js'
import { wordIndexAt, type TimedCues } from './actions.js'

/**
 * Moves written in the prose of a comment ("contra Aa4", "con Ac5!", "Cge7,
 * buscando un posible Cg6", "las blancas pueden jugar con c3, con idea de d4"),
 * read against the position the comment talks about: which piece really makes
 * the move (legal moves only, seen from the side to move unless the sentence names
 * the other side), and, for a follow-up named in the same sentence, the position
 * after the first move. No engine.
 */

type PieceType = 'p' | 'n' | 'b' | 'r' | 'q' | 'k'
type Side = 'w' | 'b'

export interface ProseMoveMention {
  /** The text as written ("Cge7", "Ac5!", "a6"). */
  text: string
  start: number
  end: number
  /** The piece named; null for a bare square (a pawn move). */
  piece: PieceType | null
  /** The file or rank that tells which piece ("g" in "Cge7"; the file of a pawn capture "bxa4"). */
  hint: string
  capture: boolean
  to: string
  /** The other piece an ambiguous letter may mean (R is the rook in English, the king in Spanish; the language is not known). */
  alt?: PieceType
  /** A square the text names ("la casilla f4"), not a move. */
  named: boolean
}

const LETTERS = {
  es: { R: 'k', D: 'q', T: 'r', A: 'b', C: 'n' },
  en: { K: 'k', Q: 'q', R: 'r', B: 'b', N: 'n' },
  de: { K: 'k', D: 'q', T: 'r', L: 'b', S: 'n' },
} as const satisfies Record<string, Record<string, PieceType>>
const AUTO: Record<string, PieceType> = { ...LETTERS.de, ...LETTERS.es, ...LETTERS.en }

/** A square-led token: optional piece letter, optional origin hint, optional capture, the target square. */
const TOKEN = /(?<![A-Za-zÀ-ÿ0-9-])([KQRBNACDTLS])?([a-h1-8])?(x)?([a-h][1-8])(?:=[QRBNDTAC])?[+#]?[!?]*(?![A-Za-zÀ-ÿ0-9]|-[a-h][1-8])/g
const BARE_PAWN_CAPTURE = /(?<![A-Za-zÀ-ÿ0-9-])([a-h])x([a-h][1-8])[+#]?[!?]*(?![A-Za-zÀ-ÿ0-9])/g
const SQUARE_WORD = /(?:casillas?|squares?|feld(?:er)?|columna|fila)\s+(?:de\s+|en\s+|the\s+)?$/i

export function findProseMoves(text: string, opts: { lang?: 'es' | 'en' | 'de' } = {}): ProseMoveMention[] {
  const lang = opts.lang ?? detectProseLang(text)
  const letters: Record<string, PieceType> = lang ? LETTERS[lang] : AUTO
  const out: ProseMoveMention[] = []
  for (const m of text.matchAll(TOKEN)) {
    const [whole, letter, hint, x, to] = m
    let piece: PieceType | null = null
    let alt: PieceType | undefined
    if (letter) {
      piece = letters[letter] ?? null
      if (!piece) continue
      if (!lang && letter === 'R') { piece = 'r'; alt = 'k' }
    } else if (hint && !x) {
      continue // "a" + "b4" glued is not a move
    }
    // "e4" written with a hint but no piece ("ge7") is not a move either.
    if (!letter && hint) continue
    const start = m.index!
    const named = !piece && SQUARE_WORD.test(text.slice(Math.max(0, start - 24), start))
    out.push({ text: whole, start, end: start + whole.length, piece, hint: hint ?? '', capture: !!x, to, named, ...(alt ? { alt } : {}) })
  }
  for (const m of text.matchAll(BARE_PAWN_CAPTURE)) {
    if (out.some((o) => o.start <= m.index! && m.index! < o.end)) continue
    out.push({ text: m[0], start: m.index!, end: m.index! + m[0].length, piece: null, hint: m[1], capture: true, to: m[2], named: false })
  }
  return out.sort((a, b) => a.start - b.start)
}

export interface ProseMove {
  piece: PieceType
  color: Side
  from: string
  to: string
}

export interface ResolvedProseMove {
  mention: ProseMoveMention
  /** Every legal move the text may mean (several pieces of a kind reach the square). */
  moves: ProseMove[]
  /** Read on the position after a move named earlier in the sentence. */
  secondary: boolean
}

function withTurn(fen: string, side: Side): string {
  const f = fen.split(' ')
  return [f[0], side, f[2] ?? '-', '-', f[4] ?? '0', f[5] ?? '1'].join(' ')
}

const turnOf = (fen: string): Side => (fen.split(' ')[1] === 'b' ? 'b' : 'w')
const other = (s: Side): Side => (s === 'w' ? 'b' : 'w')

/** Legal moves to `to` by `piece` (null: a pawn push or capture) of `side`, with the origin hint. */
function legalMoves(fen: string, side: Side, m: Pick<ProseMoveMention, 'piece' | 'hint' | 'capture' | 'to' | 'alt'>): ProseMove[] {
  if (!validFen(fen)) return []
  let chess: Chess
  try { chess = new Chess(side === turnOf(fen) ? fen : withTurn(fen, side), { skipValidation: true }) } catch { return [] }
  const wants: PieceType[] = [m.piece ?? 'p', ...(m.alt ? [m.alt] : [])]
  const moves = chess.moves({ verbose: true })
  for (const want of wants) {
    const found = pick(moves, want, m, side)
    if (found.length) return found
  }
  return []
}

function pick(moves: Move[], want: PieceType, m: Pick<ProseMoveMention, 'piece' | 'hint' | 'capture' | 'to'>, side: Side): ProseMove[] {
  return moves
    .filter((mv) => mv.piece === want && mv.to === m.to && (!m.hint || mv.from.includes(m.hint)) && (m.piece !== null || !m.capture === !mv.captured))
    .map((mv) => ({ piece: mv.piece as PieceType, color: side, from: mv.from, to: mv.to }))
}

const validFen = (fen: string) => /^(?:[pnbrqkPNBRQK1-8]{1,8}\/){7}[pnbrqkPNBRQK1-8]{1,8}\s+[wb]\b/.test(fen.trim())

/** The side a sentence names before `at` ("las blancas", "Black"), or null. */
function namedSide(text: string, at: number): Side | null {
  const sentenceStart = Math.max(text.lastIndexOf('. ', at), text.lastIndexOf('? ', at), text.lastIndexOf('! ', at), text.lastIndexOf('\n', at)) + 1
  const before = text.slice(sentenceStart, at)
  let side: Side | null = null
  let last = -1
  for (const m of before.matchAll(/\b(?:blancas?|white|wei(?:ß|ss)\w*)\b|\b(negras?|black|schwarz\w*)\b/gi)) {
    if (m.index! >= last) { last = m.index!; side = m[1] ? 'b' : 'w' }
  }
  return side
}

const STRONG_FOLLOW = /posible|buscando|luego|despu[eé]s|seguid|tras\b|then|followed|aiming|planning|dann|danach|anschlie/i
const WEAK_FOLLOW = /idea|amenaz|threat|next|siguiente|pr[oó]xim/i

/** Read the moves of `text` on `fen`, following a plan named inside one sentence on the position after its first move. */
export function resolveProseMoves(text: string, fen: string, opts: { lang?: 'es' | 'en' | 'de' } = {}): ResolvedProseMove[] {
  const out: ResolvedProseMove[] = []
  let previous: { moves: ProseMove[]; fenAfter: string | null; end: number } | null = null
  for (const mention of findProseMoves(text, opts)) {
    if (mention.named) { previous = null; continue }
    const named = namedSide(text, mention.start)
    const sides = (base: Side): Side[] => (named ? [named] : mention.piece ? [base, other(base)] : [base])
    const now = (): ProseMove[] => {
      for (const side of sides(turnOf(fen))) {
        const found = legalMoves(fen, side, mention)
        if (found.length) return found
      }
      return []
    }
    const ahead = (): ProseMove[] => {
      if (!previous?.fenAfter) return []
      const between = text.slice(previous.end, mention.start)
      if (/[.?!]\s/.test(between) || between.length > 140) return []
      const continuing = previous.moves[0].color
      for (const side of named ? [named] : [continuing, other(continuing)]) {
        const found = legalMoves(previous.fenAfter, side, mention)
        if (found.length) return found
      }
      return []
    }
    const between = previous ? text.slice(previous.end, mention.start) : ''
    const strong = !!previous && STRONG_FOLLOW.test(between)
    const weak = !!previous && WEAK_FOLLOW.test(between)
    let moves: ProseMove[] = []
    let secondary = false
    if (strong) { moves = ahead(); secondary = moves.length > 0; if (!moves.length) moves = now() }
    else { moves = now(); if (!moves.length && weak) { moves = ahead(); secondary = moves.length > 0 } }
    out.push({ mention, moves, secondary })
    // A single clear move opens the position its follow-up is read on.
    const sole = moves.length === 1 ? moves[0] : null
    let fenAfter: string | null = null
    if (sole) {
      try {
        const base: string = secondary ? previous!.fenAfter! : fen
        const c: Chess = new Chess(sole.color === turnOf(base) ? base : withTurn(base, sole.color), { skipValidation: true })
        c.move({ from: sole.from, to: sole.to, promotion: 'q' })
        fenAfter = c.fen()
      } catch { fenAfter = null }
    }
    previous = moves.length ? { moves, fenAfter, end: mention.end } : previous
  }
  return out
}

/** The board cue of one resolved move: origin and target squares and an arrow (a follow-up is told apart). */
export function proseMoveCues(r: ResolvedProseMove): BoardCue {
  const fromRole = r.secondary ? 'mention' : 'from'
  const toRole = r.secondary ? 'mention' : 'to'
  const squares: BoardCue['squares'] = []
  const add = (square: string, role: BoardCue['squares'][number]['role']) => {
    if (!squares.some((s) => s.square === square)) squares.push({ square, role })
  }
  for (const m of r.moves) add(m.from, fromRole)
  for (const m of r.moves) add(m.to, toRole)
  return {
    kind: 'move', label: r.mention.text, squares,
    arrows: r.moves.map((m) => ({ from: m.from, to: m.to, role: toRole })),
    start: r.mention.start, end: r.mention.end,
  }
}

/** One entry per move found, at the word where it is written: the narrator shows it as it reaches it. */
export function proseMoveSchedule(text: string, fen: string, opts: { lang?: 'es' | 'en' | 'de' } = {}): TimedCues[] {
  return resolveProseMoves(text, fen, opts)
    .filter((r) => r.moves.length > 0)
    .map((r) => ({ at: wordIndexAt(text, r.mention.start), clear: false, cues: [proseMoveCues(r)] }))
}

/**
 * The squares of the pieces an isolated move ("Ab5", "a6") may be: the legal origins for the side to
 * move, else for the other side. Several when several pieces reach it; none when no piece does.
 */
export function isolatedMoveOrigins(fen: string, piece: PieceType, to: string, hint = '', capture = false): { from: string[]; color: Side | null } {
  let turn: Side
  if (!validFen(fen)) return { from: [], color: null }
  turn = turnOf(fen)
  const mention = { piece: piece === 'p' ? null : piece, hint, capture, to }
  for (const side of piece === 'p' ? [turn, other(turn)] : [turn, other(turn)]) {
    const found = piece === 'p'
      ? legalMoves(fen, side, mention).filter((m) => m.piece === 'p')
      : legalMoves(fen, side, mention)
    if (found.length) return { from: [...new Set(found.map((m) => m.from))].sort(), color: side }
  }
  return { from: [], color: null }
}
