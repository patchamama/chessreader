import { Chess } from 'chess.js'

/** A Lichess puzzle: the solver moves first from `fen` (the side to move). */
export interface Puzzle {
  id: string
  rating: number
  plays: number
  themes: string[]
  fen: string
  /** The opponent's move that led to the puzzle (UCI), to show it on the board. */
  lastMove: string
  /** The solver's and the opponent's moves, alternating (UCI). */
  solution: string[]
  game: { id: string; white: string; black: string; perf: string; url: string }
}

interface PuzzleAnswer {
  game: { id: string; perf?: { name: string }; players: { name: string; color: string; rating?: number }[] }
  puzzle: { id: string; rating: number; plays: number; solution: string[]; themes: string[]; fen: string; lastMove: string; initialPly: number }
}

function toPuzzle(a: PuzzleAnswer): Puzzle {
  const player = (color: string) => {
    const p = a.game.players.find((x) => x.color === color)
    return p ? `${p.name}${p.rating ? ` (${p.rating})` : ''}` : '?'
  }
  return {
    id: a.puzzle.id, rating: a.puzzle.rating, plays: a.puzzle.plays, themes: a.puzzle.themes,
    fen: a.puzzle.fen, lastMove: a.puzzle.lastMove, solution: a.puzzle.solution,
    game: { id: a.game.id, white: player('white'), black: player('black'), perf: a.game.perf?.name ?? '', url: `https://lichess.org/${a.game.id}#${a.puzzle.initialPly}` },
  }
}

async function getPuzzle(url: string, token?: string): Promise<Puzzle> {
  const res = await fetch(url, token ? { headers: { Authorization: `Bearer ${token}` } } : undefined)
  if (!res.ok) throw new Error(`lichess.org answered ${res.status}`)
  return toPuzzle((await res.json()) as PuzzleAnswer)
}

/** The Lichess puzzle of the day (no token needed). */
export const lichessDailyPuzzle = () => getPuzzle('https://lichess.org/api/puzzle/daily')

/** A new puzzle; with a token, one chosen for the user's puzzle rating. */
export const lichessNextPuzzle = (token?: string) => getPuzzle('https://lichess.org/api/puzzle/next', token)

export type PuzzleStep = { result: 'correct'; reply: string; next: number } | { result: 'wrong' } | { result: 'solved' }

/** The position after the first `ply` moves of the solution. */
export function puzzlePosition(puzzle: Puzzle, ply: number): Chess {
  const chess = new Chess(puzzle.fen)
  for (const m of puzzle.solution.slice(0, ply)) chess.move({ from: m.slice(0, 2), to: m.slice(2, 4), promotion: m[4] })
  return chess
}

/**
 * Judge the solver's move at step `ply` (always a solver's turn). As on
 * Lichess, any move that mates solves the puzzle.
 */
export function puzzleMove(puzzle: Puzzle, ply: number, uci: string): PuzzleStep {
  const chess = puzzlePosition(puzzle, ply)
  try {
    chess.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] ?? 'q' })
  } catch {
    return { result: 'wrong' }
  }
  if (chess.isCheckmate()) return { result: 'solved' }
  const expected = puzzle.solution[ply]
  if (uci !== expected && !(uci.length === 4 && expected?.startsWith(uci) && expected[4] === 'q')) return { result: 'wrong' }
  if (ply + 1 >= puzzle.solution.length) return { result: 'solved' }
  return { result: 'correct', reply: puzzle.solution[ply + 1], next: ply + 2 }
}
