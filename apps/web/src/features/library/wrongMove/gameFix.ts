import { extractPlayers, type RecognizedGame, type WrongMoveFix, type WrongMoveResult } from '@chess-ebook/chess-shared'
import { APP_VERSION } from '../../../version'
import { buildErrataEntry, type BuildErrataInput, type ErrataEntry } from '../errata/errataFormat'
import { saveErrata } from '../errata/errataSource'
import { buildSuggestion } from '../../suggestions/suggestionFormat'
import { saveSuggestion } from '../../suggestions/suggestionsApi'
import type { EditableMove } from '../correction/workbench'
import { applyFix, CONTEXT_PLIES, fixLabel, rankPrompt } from './wrongMove'

/**
 * What the correction workbench and the Errors-page batch share to turn a
 * wrong-move fix into a saved correction: the game's players, its errata entry
 * (substitutions), its 'move' suggestion (insert, delete, swap) and the LLM's
 * ranking question.
 */

/** The players of game `gameIndex`, read from the text between the previous game and its end. */
export function gamePlayers(text: string, games: RecognizedGame[], gameIndex: number) {
  const game = games[gameIndex]
  return extractPlayers(text.slice(gameIndex > 0 ? games[gameIndex - 1].charEnd : 0, game.charEnd))
}

export interface GameErrataInput {
  text: string
  games: RecognizedGame[]
  gameIndex: number
  /** The printed main line (initialMoves). */
  original: EditableMove[]
  book: ErrataEntry['book']
  chapter: number
  corrected: BuildErrataInput['corrected']
}

/** The errata entry of a corrected main line of the same length, or null when it is not a substitution. */
export function buildGameErrata({ text, games, gameIndex, original, book, chapter, corrected }: GameErrataInput): ErrataEntry | null {
  const game = games[gameIndex]
  if (!game || corrected.length !== original.length) return null
  const players = gamePlayers(text, games, gameIndex)
  const last = original[original.length - 1]?.source?.charEnd ?? game.charEnd
  return buildErrataEntry({
    book,
    chapter,
    gameIndex,
    game: { label: players.white && players.black ? `${players.white} – ${players.black}` : `Game ${gameIndex + 1}`, white: players.white ?? null, black: players.black ?? null },
    original: original.map((m) => ({ written: m.source?.written ?? m.san, san: m.san })),
    corrected,
    text: text.slice(original[0]?.source?.charStart ?? game.charStart, last),
    appVersion: APP_VERSION,
  })
}

export type FixSaveResult =
  | { ok: true; path: string }
  | { ok: false; path: string; json: string; reason?: string }
  | { ok: false; reason: string }

export interface SaveFixInput {
  /** The printed main line the fix applies to. */
  moves: EditableMove[]
  gameIndex: number
  /** The errata entry for a corrected main line of the same length, or null when it cannot be built. */
  errataFor: (corrected: BuildErrataInput['corrected']) => ErrataEntry | null
  /** The book (by title) and chapter the suggestion is filed under; null when the game is not from a book. */
  target: { book: string | null; chapter: number | null }
  /** Shown when the correction cannot be filed. */
  noBook: string
}

/** Save a fix: an errata entry (source engine) for a substitution, a 'move' suggestion for the others. Nothing is applied. */
export async function saveWrongMoveFix(fix: WrongMoveFix, { moves, gameIndex, errataFor, target, noBook }: SaveFixInput): Promise<FixSaveResult> {
  const evidence = `wrong-move finder: ${fixLabel(fix)}, ${fix.playedAfter} later moves play`
  if (fix.kind === 'substitute') {
    const entry = errataFor(moves.map((m, i) => (i === fix.ply ? { san: fix.to, origin: 'engine' as const, evidence } : { san: m.san })))
    if (!entry) return { ok: false, reason: noBook }
    const r = await saveErrata(entry)
    return r.saved ? { ok: true, path: r.path } : { ok: false, path: r.path, json: r.json, reason: r.reason }
  }
  if (!target.book) return { ok: false, reason: noBook }
  const sans = moves.map((m) => m.san)
  const s = buildSuggestion({
    kind: 'move',
    target: { book: target.book, ...(target.chapter !== null ? { chapter: target.chapter } : {}), gameIndex },
    before: sans,
    after: applyFix(sans, fix),
    author: 'user',
  })
  const r = await saveSuggestion(s)
  return r.saved ? { ok: true, path: r.path } : { ok: false, path: r.path, json: r.json, reason: r.reason }
}

/** The LLM's ranking question for a result: the printed text around the failing move and the numbered fixes. */
export function rankQuestion(moves: EditableMove[], text: string, result: WrongMoveResult): string | null {
  const f = result.failingPly
  if (f === null || result.fixes.length === 0) return null
  const near = moves.slice(Math.max(0, f - CONTEXT_PLIES), Math.min(moves.length, f + CONTEXT_PLIES + 1)).filter((m) => m.source)
  const excerpt = near.length ? text.slice(near[0].source!.charStart, near[near.length - 1].source!.charEnd) : ''
  return rankPrompt({ moves: moves.map((m) => ({ written: m.source?.written ?? m.san })), failingPly: f, excerpt, fixes: result.fixes })
}
