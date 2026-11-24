import { Chess } from 'chess.js'
import type { BoardCue } from '../teaching/commentCues.js'
import { lineSquares } from '../teaching/commentCues.js'

/**
 * Narration actions: a compact list stored with a comment that says what the
 * board shows while the comment is narrated, e.g. "0Diagonal:c8-h3, 1Arrow:f7-f5".
 * Each item is `<token index><Action>[:args]`: at that word of the comment (counted
 * from 0, words split by white space) the action happens.
 *
 *   Square:e4   Squares:e4|e5   Arrow:f7-f5   Diagonal:c8-h3   Line:a1-a8   Piece:c8   Clear
 *
 * Marks accumulate until a Clear. Parsing, writing and validating the list and the
 * runner that turns it into board cues live here; the AI that writes it is in the web app.
 */

export type NarrationAction =
  | { at: number; kind: 'Square'; square: string }
  | { at: number; kind: 'Squares'; squares: string[] }
  | { at: number; kind: 'Arrow'; from: string; to: string }
  | { at: number; kind: 'Diagonal'; from: string; to: string }
  | { at: number; kind: 'Line'; from: string; to: string }
  | { at: number; kind: 'Piece'; square: string }
  | { at: number; kind: 'Clear' }

export const ACTION_KINDS = ['Square', 'Squares', 'Arrow', 'Diagonal', 'Line', 'Piece', 'Clear'] as const

const SQUARE = /^[a-h][1-8]$/

/** The words of a comment as the narration counts them (the token indices of the actions). */
export function narrationWords(text: string): string[] {
  return text.split(/\s+/).filter(Boolean)
}

/** The index of the word at character `offset` of `text` (the next word when the offset is between two). */
export function wordIndexAt(text: string, offset: number): number {
  let i = 0
  for (const m of text.matchAll(/\S+/g)) {
    if (offset < m.index! + m[0].length) return i
    i++
  }
  return i
}

const canonical = (kind: string) => ACTION_KINDS.find((k) => k.toLowerCase() === kind.toLowerCase())

/** Split on the commas that separate actions (a "|" list never holds one). */
function parseItem(raw: string): NarrationAction | null {
  const m = /^(\d{1,4})\s*([A-Za-z]+)\s*(?::\s*(.*))?$/.exec(raw.trim())
  if (!m) return null
  const at = Number(m[1])
  const kind = canonical(m[2])
  const args = (m[3] ?? '').trim().toLowerCase()
  if (!kind) return null
  switch (kind) {
    case 'Clear':
      return args === '' ? { at, kind } : null
    case 'Square':
    case 'Piece':
      return SQUARE.test(args) ? { at, kind, square: args } : null
    case 'Squares': {
      const squares = args.split('|').map((s) => s.trim())
      return squares.length > 0 && squares.every((s) => SQUARE.test(s)) ? { at, kind, squares } : null
    }
    default: {
      const pair = /^([a-h][1-8])\s*-\s*([a-h][1-8])$/.exec(args)
      return pair ? { at, kind, from: pair[1], to: pair[2] } : null
    }
  }
}

/** Read an action list; what cannot be read is reported and left out. The result is ordered by token index. */
export function parseActions(src: string): { actions: NarrationAction[]; errors: string[] } {
  const actions: NarrationAction[] = []
  const errors: string[] = []
  for (const raw of src.split(',')) {
    if (raw.trim() === '') continue
    const a = parseItem(raw)
    if (a) actions.push(a)
    else errors.push(raw.trim())
  }
  return { actions: actions.map((a, i) => ({ a, i })).sort((x, y) => x.a.at - y.a.at || x.i - y.i).map((x) => x.a), errors }
}

export function serializeAction(a: NarrationAction): string {
  switch (a.kind) {
    case 'Clear': return `${a.at}Clear`
    case 'Square': case 'Piece': return `${a.at}${a.kind}:${a.square}`
    case 'Squares': return `${a.at}Squares:${a.squares.join('|')}`
    default: return `${a.at}${a.kind}:${a.from}-${a.to}`
  }
}

export function serializeActions(actions: NarrationAction[]): string {
  return actions.map(serializeAction).join(', ')
}

export type ActionRejection = 'bad-square' | 'same-square' | 'not-a-diagonal' | 'not-a-line' | 'no-piece' | 'no-piece-on-origin' | 'token-out-of-range'

/**
 * Keep the actions that make sense on the position (and for a comment of `words` words):
 * squares exist, a diagonal is a diagonal, a line a rank or file, an arrow starts on a piece.
 * The rest are returned with the reason, for the AI step to discard.
 */
export function validateActions(actions: NarrationAction[], fen: string, opts: { words?: number } = {}): { valid: NarrationAction[]; rejected: { action: NarrationAction; reason: ActionRejection }[] } {
  let chess: Chess | null = null
  try { chess = new Chess(fen, { skipValidation: true }) } catch { /* no board: piece checks are skipped */ }
  const hasPiece = (sq: string) => !chess || !!chess.get(sq as never)
  const valid: NarrationAction[] = []
  const rejected: { action: NarrationAction; reason: ActionRejection }[] = []
  for (const action of actions) {
    const reason = rejection(action, hasPiece, opts.words)
    if (reason) rejected.push({ action, reason })
    else valid.push(action)
  }
  return { valid, rejected }
}

function rejection(a: NarrationAction, hasPiece: (sq: string) => boolean, words?: number): ActionRejection | null {
  if (words !== undefined && a.at >= words) return 'token-out-of-range'
  switch (a.kind) {
    case 'Clear': return null
    case 'Square': return SQUARE.test(a.square) ? null : 'bad-square'
    case 'Squares': return a.squares.every((s) => SQUARE.test(s)) ? null : 'bad-square'
    case 'Piece': return !SQUARE.test(a.square) ? 'bad-square' : hasPiece(a.square) ? null : 'no-piece'
    default: {
      if (!SQUARE.test(a.from) || !SQUARE.test(a.to)) return 'bad-square'
      if (a.from === a.to) return 'same-square'
      if (a.kind === 'Diagonal') return Math.abs(a.from.charCodeAt(0) - a.to.charCodeAt(0)) === Math.abs(Number(a.from[1]) - Number(a.to[1])) ? null : 'not-a-diagonal'
      if (a.kind === 'Line') return a.from[0] === a.to[0] || a.from[1] === a.to[1] ? null : 'not-a-line'
      return hasPiece(a.from) ? null : 'no-piece-on-origin'
    }
  }
}

const cue = (kind: BoardCue['kind'], label: string, squares: BoardCue['squares'], arrows: BoardCue['arrows'] = []): BoardCue => ({ kind, label, squares, arrows, start: 0, end: 0 })

/** The board cue of one action (Clear shows nothing). */
export function actionCues(a: NarrationAction): BoardCue[] {
  switch (a.kind) {
    case 'Clear': return []
    case 'Square': return [cue('square', a.square, [{ square: a.square, role: 'mention' }])]
    case 'Squares': return [cue('square', a.squares.join(' '), a.squares.map((square) => ({ square, role: 'mention' as const })))]
    case 'Piece': return [cue('piece', a.square, [{ square: a.square, role: 'piece' }])]
    case 'Arrow': return [cue('move', `${a.from}-${a.to}`, [{ square: a.from, role: 'from' }, { square: a.to, role: 'to' }], [{ from: a.from, to: a.to, role: 'to' }])]
    default: {
      const squares = lineSquares(a.from, a.to)
      return [cue('line', `${a.from}-${a.to}`, squares.map((square) => ({ square, role: 'line' as const })))]
    }
  }
}

/** What the board shows at word `index`: the cues of every action up to it since the last Clear. */
export function cuesAt(actions: NarrationAction[], index: number): BoardCue[] {
  let shown: BoardCue[] = []
  for (const a of actions) {
    if (a.at > index) break
    if (a.kind === 'Clear') shown = []
    else shown = [...shown, ...actionCues(a)]
  }
  return shown
}

export interface TimedCues {
  /** Word of the comment at which the cues appear. */
  at: number
  /** The board is wiped before these cues are added. */
  clear: boolean
  cues: BoardCue[]
}

/** The actions grouped by the word they happen at, for a narrator that reveals them as it speaks. */
export function actionSchedule(actions: NarrationAction[]): TimedCues[] {
  const out: TimedCues[] = []
  for (const a of actions) {
    let slot = out[out.length - 1]
    if (!slot || slot.at !== a.at) { slot = { at: a.at, clear: false, cues: [] }; out.push(slot) }
    if (a.kind === 'Clear') { slot.clear = true; slot.cues = [] } else slot.cues.push(...actionCues(a))
  }
  return out
}
