import type { LlmRequest, LlmResult } from '../../shared/llm'
import { buildSuggestion, type SuggestionTarget } from '../suggestions/suggestionFormat'
import { saveSuggestion, type SaveSuggestionResult } from '../suggestions/suggestionsApi'
import type { HumanComment } from '../library/commentdb/commentLookup'
import { gameCommentsOf, parseAiComments, parseAiText, replaceGameComments, translateGamePrompt, translatePrompt, TARGET_LANGS, universalPrompt, validateRewrite, type TargetLang } from './commentPrompts'
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
export function saveCommentProposal(c: CommentEntry, action: CommentAction, p: CommentProposal, author: 'ai' | 'user' = 'ai'): Promise<SaveSuggestionResult> {
  return saveSuggestion(buildSuggestion({
    kind: action.kind === 'universal' ? 'comment' : 'translation',
    target: targetOf(c),
    before: { text: c.text, lang: c.lang },
    after: { text: p.text, lang: p.lang, action: action.kind },
    author,
    ...(author === 'ai' ? { model: p.model } : {}),
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

export interface BatchProgress extends BatchResult {
  /** Comments handled so far. */
  done: number
  /** Comments to handle (the whole filter, not the page). */
  total: number
  /** Actions not run because the comment already has that text. */
  skipped: number
}

/** Whether the comment already has what the action would write (its own-language "translation" is the universal text). */
export function alreadyDone(c: CommentEntry, action: CommentAction): boolean {
  if (action.kind === 'translate' && action.lang === c.lang) return true
  const lang = action.kind === 'universal' ? c.lang : action.lang
  return !!c.translations?.[lang]?.trim()
}

export interface PagedBatchOptions {
  actions: CommentAction[]
  /** Redo the comments that already have the text; off: they are skipped. */
  overwrite: boolean
  pageSize?: number
  signal: AbortSignal
  report: (done: number, total: number) => void
  onProgress?: (p: BatchProgress) => void
}

/**
 * Batch over a whole list read lazily, page by page (never all in memory):
 * each action on each comment, skipping what already exists unless `overwrite`.
 * Cancel with the signal; running it again resumes by skipping what was done.
 */
export async function runPagedBatch(
  complete: Complete,
  loadPage: (offset: number, limit: number) => Promise<{ total: number; comments: CommentEntry[] }>,
  { actions, overwrite, pageSize = 50, signal, report, onProgress }: PagedBatchOptions,
): Promise<BatchProgress> {
  const result: BatchProgress = { saved: 0, flagged: 0, failed: 0, unsaved: [], cancelled: false, done: 0, total: 0, skipped: 0 }
  for (let offset = 0; offset === 0 || offset < result.total; offset += pageSize) {
    if (signal.aborted) { result.cancelled = true; break }
    let page
    try {
      page = await loadPage(offset, pageSize)
    } catch {
      result.failed++
      break
    }
    result.total = page.total
    if (!page.comments.length) break
    for (const c of page.comments) {
      if (signal.aborted) { result.cancelled = true; break }
      for (const action of actions) {
        // Translating into the comment's own language is never useful, even overwriting.
        if (alreadyDone(c, action) && (!overwrite || (action.kind === 'translate' && action.lang === c.lang))) {
          result.skipped++
          continue
        }
        try {
          const p = await proposeComment(complete, c, action)
          if (p.problems.length) {
            result.flagged++
          } else {
            const saved = await saveCommentProposal(c, action, p)
            if (saved.saved) result.saved++
            else result.unsaved.push(saved.json)
          }
        } catch {
          result.failed++
        }
      }
      result.done++
      report(result.done, result.total)
      onProgress?.({ ...result })
    }
    if (result.cancelled) break
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

/** What was already asked this session, by comment and language (never ask twice). */
const borrowedAsked = new Map<string, Promise<string | null>>()

/** The database entry of a borrowed remark, as the AI actions and suggestions expect it. */
function entryOfBorrowed(c: HumanComment & { fen: string }): CommentEntry {
  return {
    id: c.id ?? 0, hash: '', fen: c.fen, text: c.text, lang: c.lang, ply: c.ply, move: Math.ceil(c.ply / 2), san: c.san, gameId: c.gameId, chapter: null,
    source: { id: 0, title: c.source.title, author: c.source.author, kind: c.source.kind, lang: c.lang, book: null },
    game: { white: null, black: null, label: c.label }, ...(c.translations ? { translations: c.translations } : {}),
  }
}

/**
 * Standardise a borrowed remark in its own language (the original stays as it
 * is in the database): the text is for the game right away and is saved as a
 * PENDING suggestion by the AI. Null on a failed or flagged proposal; never throws.
 */
export function normalizeBorrowedComment(
  complete: Complete, c: HumanComment & { fen: string }, cache: Map<string, Promise<string | null>> = borrowedAsked,
): Promise<string | null> {
  const key = `${c.id ?? `${c.gameId}:${c.ply}:${c.text}`}:normalized`
  const known = cache.get(key)
  if (known) return known
  const run = (async (): Promise<string | null> => {
    const entry = entryOfBorrowed(c)
    const p = await proposeComment(complete, entry, { kind: 'universal' })
    if (p.problems.length) return null
    if (c.id !== undefined) {
      try { await saveCommentProposal(entry, { kind: 'universal' }, p) } catch { /* the text still serves the game */ }
    }
    return p.text
  })().catch(() => null)
  cache.set(key, run)
  return run
}

/**
 * A remark borrowed for a game that the database has no text for in the
 * reader's language: standardise it when it has no universal text, then
 * translate it. The text is for the game right away; each step is also saved
 * as a PENDING suggestion by the AI (never accepted). A failed or flagged step
 * gives null; this never throws.
 */
export function translateBorrowedComment(
  complete: Complete, c: HumanComment & { fen: string }, lang: string, cache: Map<string, Promise<string | null>> = borrowedAsked,
): Promise<string | null> {
  const key = `${c.id ?? `${c.gameId}:${c.ply}:${c.text}`}:${lang}`
  const known = cache.get(key)
  if (known) return known
  const run = (async (): Promise<string | null> => {
    if (!(TARGET_LANGS as readonly string[]).includes(lang)) return null
    const entry = entryOfBorrowed(c)
    const save = async (e: CommentEntry, action: CommentAction, p: CommentProposal) => {
      if (c.id === undefined) return
      try { await saveCommentProposal(e, action, p) } catch { /* the text still serves the game */ }
    }
    let text = c.translations?.[c.lang]?.trim() ? c.translations[c.lang] : c.text
    if (!c.translations?.[c.lang]?.trim()) {
      const universal = await proposeComment(complete, entry, { kind: 'universal' })
      if (universal.problems.length) return null
      await save(entry, { kind: 'universal' }, universal)
      text = universal.text
    }
    if (c.lang === lang) return text
    const base = { ...entry, text }
    const action: CommentAction = { kind: 'translate', lang: lang as TargetLang }
    const translated = await proposeComment(complete, base, action)
    if (translated.problems.length) return null
    await save(base, action, translated)
    return translated.text
  })().catch(() => null)
  cache.set(key, run)
  return run
}
