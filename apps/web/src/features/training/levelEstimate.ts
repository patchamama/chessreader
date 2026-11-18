/**
 * A level test: puzzles of growing or falling difficulty, as with a rating.
 * After each puzzle the estimate moves like an Elo rating against the
 * puzzle's rating, with big steps first and small ones at the end.
 */
export interface LevelState { rating: number; answered: number; history: { puzzle: number; solved: boolean }[] }

export const LEVEL_PUZZLES = 15

export function startLevel(rating = 1500): LevelState {
  return { rating, answered: 0, history: [] }
}

/** The step of the estimate: 250 at the first puzzle, down to 40 at the last. */
const step = (answered: number) => Math.max(40, 250 - answered * 15)

/** The estimate after one more puzzle. */
export function answerLevel(s: LevelState, puzzleRating: number, solved: boolean): LevelState {
  const expected = 1 / (1 + 10 ** ((puzzleRating - s.rating) / 400))
  const rating = Math.round(Math.min(3000, Math.max(400, s.rating + step(s.answered) * ((solved ? 1 : 0) - expected))))
  return { rating, answered: s.answered + 1, history: [...s.history, { puzzle: puzzleRating, solved }] }
}

/** How sure the estimate is: ± points, from how many puzzles were answered. */
export const levelMargin = (s: LevelState) => Math.round(350 / Math.sqrt(Math.max(1, s.answered)))
