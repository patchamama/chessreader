import { Chess } from 'chess.js'

/**
 * What an AI (or a person) needs to say which squares a comment is about: for
 * every piece, where it can go, and how far the bishops, rooks and queens see
 * along their diagonals, ranks and files. The side to move has its legal moves; the
 * other side is read as if it were to move.
 */
export interface PieceFacts {
  square: string
  piece: 'p' | 'n' | 'b' | 'r' | 'q' | 'k'
  color: 'w' | 'b'
  /** Squares it can move to, sorted. */
  moves: string[]
  /** For bishops, rooks and queens: the straight lines it sees, up to the first piece in the way. */
  rays: { kind: 'diagonal' | 'rank' | 'file'; from: string; to: string }[]
}

export interface PositionFacts {
  turn: 'w' | 'b'
  pieces: PieceFacts[]
}

const DIRS: Record<string, [number, number, 'diagonal' | 'rank' | 'file'][]> = {
  b: [[1, 1, 'diagonal'], [1, -1, 'diagonal'], [-1, 1, 'diagonal'], [-1, -1, 'diagonal']],
  r: [[1, 0, 'file'], [-1, 0, 'file'], [0, 1, 'rank'], [0, -1, 'rank']],
  q: [[1, 1, 'diagonal'], [1, -1, 'diagonal'], [-1, 1, 'diagonal'], [-1, -1, 'diagonal'], [1, 0, 'file'], [-1, 0, 'file'], [0, 1, 'rank'], [0, -1, 'rank']],
}
const FILES = 'abcdefgh'

function withTurn(fen: string, side: 'w' | 'b'): string {
  const f = fen.split(' ')
  return [f[0], side, f[2] ?? '-', '-', f[4] ?? '0', f[5] ?? '1'].join(' ')
}

export function positionFacts(fen: string): PositionFacts {
  let board: Chess
  try { board = new Chess(fen, { skipValidation: true }) } catch { return { turn: 'w', pieces: [] } }
  const turn = board.turn()
  const movesOf = new Map<'w' | 'b', Map<string, Set<string>>>()
  for (const side of ['w', 'b'] as const) {
    const map = new Map<string, Set<string>>()
    let c: Chess
    try { c = side === turn ? new Chess(fen, { skipValidation: true }) : new Chess(withTurn(fen, side), { skipValidation: true }) } catch { continue }
    for (const mv of c.moves({ verbose: true })) {
      if (!map.has(mv.from)) map.set(mv.from, new Set())
      map.get(mv.from)!.add(mv.to)
    }
    movesOf.set(side, map)
  }
  const pieces: PieceFacts[] = []
  for (const row of board.board()) {
    for (const cell of row) {
      if (!cell) continue
      const rays: PieceFacts['rays'] = []
      for (const [df, dr, kind] of DIRS[cell.type] ?? []) {
        let f = FILES.indexOf(cell.square[0]) + df
        let r = Number(cell.square[1]) + dr
        let last: string | null = null
        while (f >= 0 && f < 8 && r >= 1 && r <= 8) {
          const sq = `${FILES[f]}${r}`
          const there = board.get(sq as never)
          if (there) { if (there.color !== cell.color) last = sq; break }
          last = sq
          f += df
          r += dr
        }
        if (last) rays.push({ kind, from: cell.square, to: last })
      }
      pieces.push({ square: cell.square, piece: cell.type, color: cell.color, moves: [...(movesOf.get(cell.color)?.get(cell.square) ?? [])].sort(), rays })
    }
  }
  return { turn, pieces }
}
