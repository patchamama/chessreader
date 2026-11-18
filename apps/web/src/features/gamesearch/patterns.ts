import { Chess } from 'chess.js'
import type { Puzzle } from './puzzles'

export interface PatternTheme { theme: string; en: string; es: string; count: number }

const base = () => `${import.meta.env.BASE_URL ?? '/'}patterns/`

/** The tactical themes of the pattern trainer (Lichess puzzle database, CC0). */
export async function loadPatternIndex(): Promise<PatternTheme[]> {
  const res = await fetch(`${base()}index.json`)
  if (!res.ok) throw new Error(`patterns: ${res.status}`)
  return ((await res.json()) as { themes: PatternTheme[] }).themes
}

/**
 * A puzzle of a theme near a rating. In the database the FEN is the position
 * before the opponent's move, which is the first of the moves: it is played,
 * and the solver moves from there.
 */
export async function patternPuzzle(theme: string, rating: number, random: () => number = Math.random): Promise<Puzzle> {
  const res = await fetch(`${base()}${theme}.json`)
  if (!res.ok) throw new Error(`patterns: ${res.status}`)
  const all = (await res.json()) as [string, string, string, number][]
  const near = all.filter((p) => Math.abs(p[3] - rating) <= 300)
  const pool = near.length ? near : all
  const [id, fen, moves, r] = pool[Math.floor(random() * pool.length)]
  const [first, ...solution] = moves.split(' ')
  const chess = new Chess(fen)
  chess.move({ from: first.slice(0, 2), to: first.slice(2, 4), promotion: first[4] })
  return { id, rating: r, plays: 0, themes: [theme], fen: chess.fen(), lastMove: first, solution, game: { id, white: '', black: '', perf: '', url: `https://lichess.org/training/${id}` } }
}
