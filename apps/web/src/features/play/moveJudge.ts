import { winPercent, type Score } from '@chess-ebook/chess-shared'

/** How a played move is judged in the Play status line and on the board. */
export type MoveKind = 'book' | 'best' | 'good' | 'inaccuracy' | 'mistake' | 'blunder'

/** Board and legend colours of each kind (same family as the review cues). */
export const MOVE_KIND_COLORS: Record<MoveKind, string> = {
  book: '#a16207',
  best: '#059669',
  good: '#65a30d',
  inaccuracy: '#d97706',
  mistake: '#ea580c',
  blunder: '#dc2626',
}

export interface MoveJudgement {
  kind: MoveKind
  /** Winning chances given away against the best move (0–100). */
  loss: number
  /** Endgame result after the move, when a tablebase judged it. */
  tablebase?: string
  /** The book opening the move reaches. */
  opening?: string
}

const kindFor = (loss: number): MoveKind =>
  loss >= 30 ? 'blunder' : loss >= 20 ? 'mistake' : loss >= 10 ? 'inaccuracy' : loss >= 2 ? 'good' : 'best'

/**
 * Judge a move by the engine: `before` is the score of the best move, `after`
 * the score after the played move (both from White's point of view). The
 * thresholds are those of the game review.
 */
export function judgeByEngine(before: Score, after: Score, mover: 'w' | 'b', isBest: boolean): MoveJudgement {
  const mine = (s: Score) => (mover === 'w' ? winPercent(s) : 100 - winPercent(s))
  const loss = isBest ? 0 : Math.max(0, Math.round((mine(before) - mine(after)) * 10) / 10)
  return { kind: kindFor(loss), loss }
}

export interface TablebaseAnswer {
  category: string
  moves: { uci: string; san: string; category: string }[]
}

// Result for the side that moved, from the category the tablebase gives the opponent after the move.
const RANK: Record<string, number> = { loss: 4, 'blessed-loss': 3, 'maybe-loss': 3, draw: 2, unknown: 2, 'cursed-win': 1, 'maybe-win': 1, win: 0 }
const RESULT: Record<string, string> = { loss: 'win', 'blessed-loss': 'win', 'maybe-loss': 'win', draw: 'draw', unknown: 'draw', 'cursed-win': 'loss', 'maybe-win': 'loss', win: 'loss' }

/** Judge a move with the endgame tablebase: keeping the best result is best; spoiling it is a mistake or a blunder. */
export function judgeByTablebase(tb: TablebaseAnswer, uci: string): MoveJudgement | null {
  const move = tb.moves.find((m) => m.uci === uci)
  if (!move || tb.moves.length === 0) return null
  const best = Math.max(...tb.moves.map((m) => RANK[m.category] ?? 2))
  const loss = (best - (RANK[move.category] ?? 2)) * 25
  return { kind: kindFor(loss), loss, tablebase: RESULT[move.category] ?? 'draw' }
}

const pieces = (fen: string) => fen.split(' ')[0].replace(/[^a-zA-Z]/g, '').length

/** The Lichess endgame tablebase for positions of 7 pieces or fewer (null for bigger ones). */
export async function lichessTablebase(fen: string): Promise<TablebaseAnswer | null> {
  if (pieces(fen) > 7) return null
  const res = await fetch(`https://tablebase.lichess.ovh/standard?fen=${encodeURIComponent(fen)}`)
  if (!res.ok) return null
  return (await res.json()) as TablebaseAnswer
}
