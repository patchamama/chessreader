import { Chess, type Square } from 'chess.js'
import type { EngineLine } from '../stockfish/useEngineLines'

/** Ask an engine for the best `count` lines of a position (scores for the side to move). */
type Analyse = (fen: string, depth: number, count: number) => Promise<EngineLine[]>

interface CloudAnswer {
  depth: number
  knodes: number
  pvs: { moves: string; cp?: number; mate?: number }[]
}

/** Lichess writes castling as the king taking its own rook (e1h1); the board wants e1g1. */
function standardCastling(fen: string, pv: string[]): string[] {
  const chess = new Chess(fen)
  const out: string[] = []
  for (const raw of pv) {
    const from = raw.slice(0, 2) as Square
    const to = raw.slice(2, 4) as Square
    const piece = chess.get(from)
    const target = chess.get(to)
    let move = raw
    if (piece?.type === 'k' && target?.type === 'r' && target.color === piece.color) {
      move = `${from}${to[0] > from[0] ? 'g' : 'c'}${from[1]}`
    }
    try {
      chess.move({ from: move.slice(0, 2), to: move.slice(2, 4), promotion: move[4] })
    } catch {
      break
    }
    out.push(move)
  }
  return out
}

/**
 * The lines the Lichess cloud already knows for a position (no local engine
 * needed), or null when it has none. Scores are turned to the side to move,
 * as the local engine gives them.
 */
export async function lichessCloudEval(fen: string, multiPv: number, token?: string): Promise<EngineLine[] | null> {
  const url = `https://lichess.org/api/cloud-eval?fen=${encodeURIComponent(fen)}&multiPv=${multiPv}`
  const res = await fetch(url, token ? { headers: { Authorization: `Bearer ${token}` } } : undefined)
  if (res.status === 404) return null
  if (!res.ok) throw new Error(`lichess.org answered ${res.status}`)
  const data = (await res.json()) as CloudAnswer
  const sign = fen.split(' ')[1] === 'w' ? 1 : -1
  return data.pvs.map((pv, i) => ({
    idx: i + 1,
    pv: standardCastling(fen, pv.moves.split(' ')),
    ...(pv.mate !== undefined ? { mate: sign * pv.mate } : { scoreCp: sign * (pv.cp ?? 0) }),
    depth: data.depth,
    nodes: data.knodes * 1000,
  }))
}

const known = new Map<string, EngineLine[] | null>()

/**
 * An engine that first asks the Lichess cloud and only runs `local` when the
 * cloud does not know the position (or cannot be reached).
 */
export function withCloudEval(local: Analyse, token?: string): Analyse {
  return async (fen, depth, count) => {
    const key = `${fen}|${count}`
    let lines = known.get(key)
    if (lines === undefined) {
      try {
        lines = await lichessCloudEval(fen, count, token)
      } catch {
        lines = null
      }
      known.set(key, lines)
    }
    return lines && lines.length > 0 ? lines : local(fen, depth, count)
  }
}
