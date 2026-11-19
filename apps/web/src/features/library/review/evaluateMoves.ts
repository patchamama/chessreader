import { reviewGame } from '@chess-ebook/chess-shared'
import type { GameTree, RecognizedGame } from '@chess-ebook/chess-shared'
import { hintOfQuality } from '../analysis/useLineQualities'
import { qualitiesOf, useEvalColoringStore } from '../store/evalColoringStore'
import { analyseGame, type AnalysePosition, type MoveHint } from './reviewEngine'

/**
 * Every move of the games of a chapter, or of the whole book, rated with the
 * engine (reader-analysis-round S11): the game review's classification on the
 * scale of the board's move hints, kept by the eval colouring store.
 */

/** Progress: `done` of `total` (or a fraction 0..1 when `total` is omitted). */
type Report = (done: number, total?: number) => void

export interface EvaluateOptions {
  analyse: AnalysePosition
  depth: number
  signal?: AbortSignal
  report?: Report
}

const aborted = () => new Error('aborted')

/** The rating of each main-line move of a game (null for a move that could not be analysed). */
export async function rateGameMoves(
  tree: GameTree,
  analyse: AnalysePosition,
  options: { depth: number; signal?: AbortSignal; onProgress?: (done: number, total: number) => void },
): Promise<Array<MoveHint | null>> {
  const plies = await analyseGame(tree, analyse, options)
  const review = reviewGame(plies)
  const byNode = new Map<string, MoveHint>()
  review.moves.forEach((m) => byNode.set(m.nodeId, m.quality ? hintOfQuality(m.quality) : 'good'))
  return tree.mainline.map((id) => byNode.get(id) ?? null)
}

/** Rate the games of a chapter not rated yet on their present moves; each game is kept as soon as it is done. */
export async function evaluateChapterGames(
  book: number,
  chapter: number,
  games: RecognizedGame[],
  options: EvaluateOptions,
): Promise<void> {
  const store = useEvalColoringStore.getState()
  const todo = games
    .map((game, index) => ({ game, index }))
    .filter(({ game, index }) => game.tree.mainline.length > 0 && !qualitiesOf(store.entries, book, chapter, index, game.tree))
  const total = todo.reduce((n, { game }) => n + game.tree.mainline.length + 1, 0)
  let done = 0
  for (const { game, index } of todo) {
    if (options.signal?.aborted) throw aborted()
    const hints = await rateGameMoves(game.tree, options.analyse, {
      depth: options.depth,
      signal: options.signal,
      onProgress: (d) => options.report?.(done + d, total),
    })
    done += game.tree.mainline.length + 1
    useEvalColoringStore.getState().save(book, chapter, index, game.tree, hints)
  }
  options.report?.(1)
}

/**
 * Rate every move of the whole book, chapter after chapter (`load` gives the
 * games of a chapter); the progress runs over the chapters. Games already rated
 * are skipped, so a cancelled run goes on where it stopped.
 */
export async function evaluateWholeBook(
  book: number,
  chapters: number[],
  load: (chapter: number) => Promise<RecognizedGame[]>,
  options: EvaluateOptions,
): Promise<void> {
  const n = chapters.length
  for (let i = 0; i < n; i++) {
    if (options.signal?.aborted) throw aborted()
    const games = await load(chapters[i])
    await evaluateChapterGames(book, chapters[i], games, {
      ...options,
      report: (done, total) => options.report?.((i + (total === undefined ? done : total > 0 ? done / total : 1)) / n),
    })
  }
  options.report?.(1)
}
