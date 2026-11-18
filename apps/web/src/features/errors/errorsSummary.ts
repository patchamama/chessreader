import { APP_VERSION } from '../../version'
import { errorKinds, type GameErrors } from './bookErrors'

/** One game of a book with its number of errors (the ranking keeps these, not the full errors). */
export interface GameSummary {
  chapter: number
  gameIndex: number
  label: string
  moves: number
  errors: number
  /** The first error messages, to see the cause at a glance. */
  messages: string[]
}

/** The errors of one book: what the table and the ranking show. */
export interface BookErrorSummary {
  id: number | string
  title: string
  games: number
  errors: number
  byKind: Record<string, number>
  /** The games with most errors, most first. */
  perGame: GameSummary[]
  /** ISO date of the analysis. */
  analysedAt: string
}

/** books/errors.json of the resources repository (scripts/build-errors.ts). */
export interface ErrorsFile {
  generatedAt: string
  version: string
  books: BookErrorSummary[]
}

/** How many games of a book the ranking keeps. */
export const TOP_GAMES = 100
const MESSAGES = 5

/** Summarise the recognised games of a book. */
export function summarise(id: number | string, title: string, games: GameErrors[], analysedAt = new Date().toISOString()): BookErrorSummary {
  const perGame = games
    .filter((g) => g.errors.length > 0)
    .sort((a, b) => b.errors.length - a.errors.length)
    .slice(0, TOP_GAMES)
    .map((g) => ({ chapter: g.chapter, gameIndex: g.gameIndex, label: g.label, moves: g.moves, errors: g.errors.length, messages: g.errors.slice(0, MESSAGES).map((e) => e.message) }))
  return { id, title, games: games.length, errors: games.reduce((s, g) => s + g.errors.length, 0), byKind: errorKinds(games), perGame, analysedAt }
}

/** Where the last analysis of a book is remembered: per app version, so a new recogniser analyses again. */
const cacheKey = (id: number | string) => `errors:${APP_VERSION}:${id}`

/** The remembered last analysis of a book, if any. */
export function loadCachedErrors(id: number | string): BookErrorSummary | null {
  try {
    const raw = localStorage.getItem(cacheKey(id))
    return raw ? (JSON.parse(raw) as BookErrorSummary) : null
  } catch {
    return null
  }
}

/** Remember the analysis of a book (best effort: storage may be full or blocked). */
export function saveCachedErrors(summary: BookErrorSummary): void {
  try {
    localStorage.setItem(cacheKey(summary.id), JSON.stringify(summary))
  } catch { /* not remembered */ }
}
