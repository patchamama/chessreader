import type { LlmRequest, LlmResult } from '../../shared/llm'
import { buildSuggestion, type SuggestionTarget } from '../suggestions/suggestionFormat'
import { saveSuggestion, type SaveSuggestionResult } from '../suggestions/suggestionsApi'
import { gameCommentsOf, parseAiComments, parseAiText, replaceGameComments, translateGamePrompt, translatePrompt, universalPrompt, validateRewrite, type TargetLang } from './commentPrompts'
import { loadCommentGame, moveLabel, type CommentEntry } from './commentsApi'

/** The AI actions on a comment of the database (S3): test, then save as a suggestion, one by one or in batch. */

export type Complete = (request: LlmRequest) => Promise<LlmResult>
export type CommentAction = { kind: 'universal' } | { kind: 'translate'; lang: TargetLang }

export interface CommentProposal { text: string; lang: string; model: string; problems: string[] }

const promptOf = (c: CommentEntry, action: CommentAction) => {
  const input = { text: c.text, lang: c.lang, fen: c.fen, move: moveLabel(c) }
  return action.kind === 'universal' ? universalPrompt(input) : translatePrompt(input, action.lang)
}

/** Test: what the model proposes for a comment, with the problems found in it. */
export async function proposeComment(complete: Complete, c: CommentEntry, action: CommentAction): Promise<CommentProposal> {
  const result = await complete(promptOf(c, action))
  const text = parseAiText(result.text)
  return { text, lang: action.kind === 'translate' ? action.lang : c.lang, model: result.model, problems: validateRewrite(c.text, text) }
}

const targetOf = (c: CommentEntry): SuggestionTarget => ({ book: c.source.title, commentId: c.id, ...(c.chapter ? { chapter: c.chapter } : {}) })

/** Save: the proposal as a pending suggestion ("comment" when made universal, "translation"). */
export function saveCommentProposal(c: CommentEntry, action: CommentAction, p: CommentProposal): Promise<SaveSuggestionResult> {
  return saveSuggestion(buildSuggestion({
    kind: action.kind === 'universal' ? 'comment' : 'translation',
    target: targetOf(c),
    before: { text: c.text, lang: c.lang },
    after: { text: p.text, lang: p.lang, action: action.kind },
    author: 'ai',
    model: p.model,
  }))
}

export interface BatchResult {
  saved: number
  /** Proposals not saved because they failed validation. */
  flagged: number
  failed: number
  /** JSON of the suggestions that could be stored nowhere (to download). */
  unsaved: string[]
  cancelled: boolean
}

/** Batch: the action on every comment, each valid result saved as a pending suggestion. */
export async function runCommentBatch(
  complete: Complete, comments: CommentEntry[], action: CommentAction,
  { report, signal }: { report: (done: number, total: number) => void; signal: AbortSignal },
): Promise<BatchResult> {
  const result: BatchResult = { saved: 0, flagged: 0, failed: 0, unsaved: [], cancelled: false }
  for (let i = 0; i < comments.length; i++) {
    if (signal.aborted) {
      result.cancelled = true
      break
    }
    try {
      const p = await proposeComment(complete, comments[i], action)
      if (p.problems.length) {
        result.flagged++
      } else {
        const saved = await saveCommentProposal(comments[i], action, p)
        if (saved.saved) result.saved++
        else result.unsaved.push(saved.json)
      }
    } catch {
      result.failed++
    }
    report(i + 1, comments.length)
  }
  return result
}

export interface GameProposal { gameId: string; before: string; after: string; lang: TargetLang; model: string; problems: string[] }

/** Test: the game of a comment with every {comment} translated and its moves untouched. */
export async function proposeGameTranslation(complete: Complete, c: CommentEntry, lang: TargetLang): Promise<GameProposal> {
  const game = await loadCommentGame(c.gameId)
  const originals = gameCommentsOf(game.pgn)
  if (!originals.length) throw new Error('The game has no comments to translate.')
  const result = await complete(translateGamePrompt(originals, lang))
  const translated = parseAiComments(result.text, originals.length)
  const problems = translated.flatMap((t, i) => validateRewrite(originals[i], t).map((p) => `comment ${i + 1}: ${p}`))
  return { gameId: game.id, before: game.pgn, after: replaceGameComments(game.pgn, translated), lang, model: result.model, problems }
}

/** Save: the translated game as a pending "game" suggestion. */
export function saveGameProposal(c: CommentEntry, p: GameProposal): Promise<SaveSuggestionResult> {
  return saveSuggestion(buildSuggestion({
    kind: 'game',
    target: targetOf(c),
    before: { gameId: p.gameId, pgn: p.before },
    after: { gameId: p.gameId, pgn: p.after, lang: p.lang },
    author: 'ai',
    model: p.model,
  }))
}
