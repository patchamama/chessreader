import { Chess } from 'chess.js'
import type { Puzzle } from '../gamesearch/puzzles'
import { bundled, cachedJson } from './offline'

/** One bundled level-test puzzle: id, FEN before the opponent's move, moves (UCI), rating, theme. */
export type LevelRow = [string, string, string, number, string]

/**
 * A puzzle for the level test near a rating, from the bundled set
 * (public/training/level.json, built from the Lichess puzzle database, CC0):
 * no live Lichess request. As in the database, the first move is the
 * opponent's, played before the solver moves.
 */
export async function levelPuzzle(rating: number, random: () => number = Math.random): Promise<Puzzle> {
  const all = await cachedJson<LevelRow[]>(bundled('training/level.json'))
  if (!all.length) throw new Error('level puzzles: empty set')
  const near = all.filter((p) => Math.abs(p[3] - rating) <= 200)
  const pool = near.length ? near : all
  const [id, fen, moves, r, theme] = pool[Math.min(pool.length - 1, Math.floor(random() * pool.length))]
  const [first, ...solution] = moves.split(' ')
  const chess = new Chess(fen)
  chess.move({ from: first.slice(0, 2), to: first.slice(2, 4), promotion: first[4] })
  return { id, rating: r, plays: 0, themes: [theme], fen: chess.fen(), lastMove: first, solution, game: { id, white: '', black: '', perf: '', url: `https://lichess.org/training/${id}` } }
}
