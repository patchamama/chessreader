import { Chess } from 'chess.js'
import { positionHash } from '@chess-ebook/chess-shared'
import { loadBookGames, loadBooks, type DbGameFull } from '../database/resources'

/** A game of the books that reached a position, and the move played there. */
export interface BookGame {
  gameId: string
  book: string
  white: string | null
  black: string | null
  year: number | null
  result: string
  termination: string | null
  event: string | null
  /** The whole game, to open it in the study. */
  full: DbGameFull
}
export interface BookCandidate { san: string; count: number; games: BookGame[] }
/** Position hash → move → games. */
export type PositionIndex = Map<string, Map<string, BookGame[]>>

/** Positions deeper than this are rarely reached by two games: not indexed. */
const MAX_PLY = 40

/** The main line of a PGN as SAN moves: no comments, variations, move numbers, marks or result. */
export function mainlineSans(pgn: string): string[] {
  let depth = 0
  let flat = ''
  const text = pgn.replace(/\{[^}]*\}/g, ' ').replace(/;[^\n]*/g, ' ')
  for (const ch of text) {
    if (ch === '(') { depth++; continue }
    if (ch === ')') { depth = Math.max(0, depth - 1); flat += ' '; continue }
    if (depth === 0) flat += ch
  }
  return flat
    .replace(/\$\d+/g, ' ')
    .replace(/\d+\.(\.\.)?/g, ' ')
    .split(/\s+/)
    .map((t) => t.replace(/[!?]+$/, ''))
    .filter((t) => t && !/^(1-0|0-1|1\/2-1\/2|\*)$/.test(t))
}

/** Index the positions of the books' games (main lines, first plies). */
export function buildPositionIndex(books: { book: string; games: DbGameFull[] }[], maxPly = MAX_PLY): PositionIndex {
  const index: PositionIndex = new Map()
  for (const { book, games } of books) {
    for (const g of games) {
      let chess: Chess
      try { chess = new Chess(g.fen ?? undefined) } catch { continue }
      const entry: BookGame = {
        gameId: g.id, book, white: g.white, black: g.black, year: g.year, result: g.result,
        termination: g.termination ?? null, event: g.event ?? null, full: g,
      }
      for (const san of mainlineSans(g.pgn).slice(0, maxPly)) {
        const hash = positionHash(chess.fen())
        let played: string
        try { played = chess.move(san).san } catch { break }
        let moves = index.get(hash)
        if (!moves) { moves = new Map(); index.set(hash, moves) }
        const list = moves.get(played)
        if (list) list.push(entry)
        else moves.set(played, [entry])
      }
    }
  }
  return index
}

/** The moves the books' games played from this position, most played first. */
export function bookCandidates(index: PositionIndex, fen: string): BookCandidate[] {
  const moves = index.get(positionHash(fen))
  if (!moves) return []
  return [...moves.entries()].map(([san, games]) => ({ san, count: games.length, games })).sort((a, b) => b.count - a.count)
}

let loading: Promise<PositionIndex> | null = null
/** The index of every book of the resources, built once (lazily) and kept. */
export function loadPositionIndex(): Promise<PositionIndex> {
  loading ??= (async () => {
    const books = await loadBooks()
    const all: { book: string; games: DbGameFull[] }[] = []
    for (const b of books) {
      try { all.push({ book: b.id, games: await loadBookGames(b.id) }) } catch { /* a book that cannot be read is skipped */ }
    }
    return buildPositionIndex(all)
  })()
  loading.catch(() => { loading = null })
  return loading
}
/** Test hook. */
export function clearPositionIndex() { loading = null }
