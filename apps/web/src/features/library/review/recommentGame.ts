import { annotateGame, extractPlayers, reviewGame } from '@chess-ebook/chess-shared'
import type { GameReview, Lang, PlyInput, RecognizedGame } from '@chess-ebook/chess-shared'
import { useSettingsStore, STOCKFISH_VERSIONS } from '../../../shared/settings/settingsStore'
import { hasCommentSource } from '../commentdb/commentLookup'
import { gameLineRange } from '../utils/gameRewrite'
import { humanCommentsWithLinks, withCommentAlternatives, type LinkedHumanComment } from './humanCommentLinks'
import { matchChapterLetters } from './regenerateNotation'
import { analyseGame } from './reviewEngine'
import { reviewEngine, useReviewStore } from './reviewStore'

type AnnotateOptions = Parameters<typeof annotateGame>[2]

/** How a game is commented: the options selected in the review panel under the board. */
export interface CommentOptions {
  lang: Lang
  level: 1 | 2 | 3
  layout: AnnotateOptions['layout']
  diagrams: AnnotateOptions['diagrams']
  /** Borrow the remarks of the books on the same positions (Settings, and a database to ask). */
  humanComments: boolean
  depth: number
  sfUrl: string
}

/** The options the review panel shows selected right now (level, layout, diagrams, evaluation, book remarks). */
export function commentOptionsFromPanel(): CommentOptions {
  const s = useSettingsStore.getState()
  const { level, diagramAt } = useReviewStore.getState()
  const version = STOCKFISH_VERSIONS[s.stockfishVersion]
  const label = version.label.replace(/\s*\(.*\)\s*$/, '')
  const engine = s.engineSource === 'lichess-cloud' ? `Lichess cloud / ${label}` : label
  const diagrams = s.commentDiagrams || diagramAt.length
    ? { key: s.commentDiagrams, at: diagramAt, eval: s.commentDiagramEval, engine, depth: s.reviewDepth }
    : undefined
  return {
    lang: s.language, level, layout: s.commentLayout, diagrams,
    humanComments: s.humanComments && hasCommentSource(), depth: s.reviewDepth, sfUrl: version.url,
  }
}

/** The players of a game, read from the text before it (its heading). */
export function playersOf(games: RecognizedGame[], index: number, text: string) {
  return extractPlayers(text.slice(index > 0 ? games[index - 1].charEnd : 0, games[index].charEnd))
}

/**
 * The new text of a reviewed game, from its first move to its last: its main
 * line only, commented with the given options, in the chapter's own piece
 * letters so the reader reads the whole game again (S3).
 */
export async function commentedGameText(
  reviewed: { plies: PlyInput[]; review: GameReview },
  games: RecognizedGame[],
  index: number,
  text: string,
  options: Omit<CommentOptions, 'depth' | 'sfUrl'>,
): Promise<string> {
  const game = games[index]
  const players = playersOf(games, index, text)
  let human: Record<number, LinkedHumanComment> | undefined
  if (options.humanComments) {
    const found = await humanCommentsWithLinks(reviewed.plies, options.lang).catch(() => ({}))
    if (Object.keys(found).length) human = found
  }
  // Diagrams chosen on moves of this game only.
  const diagrams = options.diagrams
    ? { ...options.diagrams, at: (options.diagrams.at ?? []).filter((id) => game.tree.nodes.has(id)) }
    : undefined
  const annotated = annotateGame(reviewed.plies, reviewed.review, {
    level: options.level, lang: options.lang, white: players.white, black: players.black,
    layout: options.layout, diagrams, ...(human ? { human } : {}),
  })
  const { start, end } = gameLineRange(text, game)
  // The annotated text opens with a title line: the chapter already names the game.
  const body = matchChapterLetters(annotated.split('\n').slice(1).join('\n'), options.lang, text.slice(start, end))
  return withCommentAlternatives(body, human ?? {}, reviewed.plies)
    .split('\n').filter((l) => l.trim() !== '' && l.trim() !== '￼').join('\n')
}

/** Analyse a game of the chapter with the engine and write its main line anew with commentary (S3). */
export async function recommentGame(
  games: RecognizedGame[],
  index: number,
  text: string,
  options: CommentOptions = commentOptionsFromPanel(),
): Promise<string> {
  const plies = await analyseGame(games[index].tree, reviewEngine(options.sfUrl), { depth: options.depth })
  return commentedGameText({ plies, review: reviewGame(plies) }, games, index, text, options)
}
