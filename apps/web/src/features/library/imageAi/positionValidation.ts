import { parseFollowingMoves } from '@chess-ebook/chess-shared'
import { boardRows } from './templateReader'

type Side = 'w' | 'b'
const FILES = 'abcdefgh'
const NAME: Record<Side, string> = { w: 'White', b: 'Black' }
const isWhite = (c: string) => c >= 'A' && c <= 'Z'
const colourOf = (c: string): Side => (isWhite(c) ? 'w' : 'b')

/** Whether a square (row 0 = rank 8) is attacked by a side. */
function attacked(rows: string[][], r: number, f: number, by: Side): boolean {
  const at = (rr: number, ff: number) => (rr >= 0 && rr < 8 && ff >= 0 && ff < 8 ? rows[rr][ff] : '.')
  const own = (c: string, ...kinds: string[]) => c !== '.' && colourOf(c) === by && kinds.includes(c.toLowerCase())
  const pawnRow = by === 'w' ? r + 1 : r - 1
  if (own(at(pawnRow, f - 1), 'p') || own(at(pawnRow, f + 1), 'p')) return true
  for (const [dr, df] of [[1, 2], [2, 1], [-1, 2], [-2, 1], [1, -2], [2, -1], [-1, -2], [-2, -1]]) if (own(at(r + dr, f + df), 'n')) return true
  for (let dr = -1; dr <= 1; dr++) for (let df = -1; df <= 1; df++) if ((dr || df) && own(at(r + dr, f + df), 'k')) return true
  for (const [dr, df, kinds] of [[1, 0, 'rq'], [-1, 0, 'rq'], [0, 1, 'rq'], [0, -1, 'rq'], [1, 1, 'bq'], [1, -1, 'bq'], [-1, 1, 'bq'], [-1, -1, 'bq']] as [number, number, string][]) {
    for (let rr = r + dr, ff = f + df; rr >= 0 && rr < 8 && ff >= 0 && ff < 8; rr += dr, ff += df) {
      const c = rows[rr][ff]
      if (c === '.') continue
      if (own(c, ...kinds.split(''))) return true
      break
    }
  }
  return false
}

/** What is wrong with a board (FEN placement field), as sentences; [] when it can be a position. */
export function validatePlacement(placement: string, sideToMove?: Side): string[] {
  const rows = boardRows(placement)
  if (!rows) return ['The board must have 8 ranks of 8 squares.']
  const issues: string[] = []
  const flat = rows.flat()
  for (const side of ['w', 'b'] as Side[]) {
    const mine = flat.filter((c) => c !== '.' && colourOf(c) === side)
    const kings = mine.filter((c) => c.toLowerCase() === 'k').length
    const pawns = mine.filter((c) => c.toLowerCase() === 'p').length
    if (kings === 0) issues.push(`${NAME[side]} has no king.`)
    if (kings > 1) issues.push(`${NAME[side]} has ${kings} kings (more than one).`)
    if (pawns > 8) issues.push(`${NAME[side]} has ${pawns} pawns (more than 8).`)
    if (mine.length > 16) issues.push(`${NAME[side]} has ${mine.length} pieces (more than 16).`)
  }
  for (const [r, rank] of [[0, 8], [7, 1]] as const) {
    rows[r].forEach((c, f) => { if (c.toLowerCase() === 'p') issues.push(`A pawn on ${FILES[f]}${rank} (pawns cannot be on rank ${rank}).`) })
  }
  if (sideToMove && !issues.length) {
    const other: Side = sideToMove === 'w' ? 'b' : 'w'
    const king = other === 'w' ? 'K' : 'k'
    const r = rows.findIndex((row) => row.includes(king))
    if (r >= 0 && attacked(rows, r, rows[r].indexOf(king), sideToMove)) {
      issues.push(`${NAME[other]} is in check but it is ${NAME[sideToMove]}'s move.`)
    }
  }
  return issues
}

/** The castling rights the king and rook squares allow, in FEN order (KQkq). */
export function castlingOptions(placement: string): string[] {
  const rows = boardRows(placement)
  if (!rows) return []
  const out: string[] = []
  if (rows[7][4] === 'K' && rows[7][7] === 'R') out.push('K')
  if (rows[7][4] === 'K' && rows[7][0] === 'R') out.push('Q')
  if (rows[0][4] === 'k' && rows[0][7] === 'r') out.push('k')
  if (rows[0][4] === 'k' && rows[0][0] === 'r') out.push('q')
  return out
}

/** The en passant target squares a double push could have left: the pawn is there, its two squares behind are empty and an enemy pawn stands beside it. */
export function enPassantOptions(placement: string, sideToMove: Side): string[] {
  const rows = boardRows(placement)
  if (!rows) return []
  const [pushed, mover, pawnRow, behind, start] = sideToMove === 'w' ? ['p', 'P', 3, 2, 1] : ['P', 'p', 4, 5, 6]
  const out: string[] = []
  for (let f = 0; f < 8; f++) {
    if (rows[pawnRow][f] !== pushed || rows[behind][f] !== '.' || rows[start][f] !== '.') continue
    if (rows[pawnRow][f - 1] === mover || rows[pawnRow][f + 1] === mover) out.push(`${FILES[f]}${8 - behind}`)
  }
  return out
}

/** Whose move the text after the diagram starts with (null when it holds no moves). */
export function sideFromFollowing(text: string): Side | null {
  return parseFollowingMoves(text)?.sideToMove ?? null
}

export function assembleFen(p: { placement: string; side: Side; castling: string[]; enPassant: string | null; moveNumber?: number }): string {
  const castling = ['K', 'Q', 'k', 'q'].filter((c) => p.castling.includes(c)).join('') || '-'
  return `${p.placement} ${p.side} ${castling} ${p.enPassant ?? '-'} 0 ${p.moveNumber ?? 1}`
}
