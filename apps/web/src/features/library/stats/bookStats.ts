import { APP_VERSION } from '../../../version'
import { hasServerSession } from '../../../shared/api/serverSession'
import { httpClient } from '../../../shared/api/httpClient'
import { chapterGames, fetchBookChapter } from '../../errors/bookErrors'
import { getJson } from '../commentdb/commentLookup'
import { bookSlug } from '../errata/errataFormat'
import { loadCommentPage, loadCommentSources } from '../../comments/commentsApi'
import { matchSource } from './sourceMatch'
import { canWriteResources, writeResourceFile } from '../../suggestions/suggestionsApi'

/** The numbers of a book (or of a chapter). */
export interface StatsCounts {
  /** Games found. */
  games: number
  /** Plies of the main lines, all games together. */
  plies: number
  /** Variations (side lines) of the games. */
  variations: number
  /** Remarks of the commentary database written into the book. */
  comments: number
  /** Recognition errors. */
  errors: number
}

/** The last computation of a book: its numbers, when and with which app version. */
export interface BookStats extends StatsCounts { analysedAt: string; version: string }

export const EMPTY_STATS: StatsCounts = { games: 0, plies: 0, variations: 0, comments: 0, errors: 0 }

export const addStats = (a: StatsCounts, b: StatsCounts): StatsCounts => ({
  games: a.games + b.games, plies: a.plies + b.plies, variations: a.variations + b.variations, comments: a.comments + b.comments, errors: a.errors + b.errors,
})

/** The numbers of one chapter's html: its games are recognised, and the book remarks counted. */
export function chapterStats(html: string): StatsCounts {
  const { games } = chapterGames(html)
  const remarks = new DOMParser().parseFromString(html, 'text/html').querySelectorAll('blockquote.human-comment').length
  return games.reduce<StatsCounts>((sum, g) => addStats(sum, {
    games: 1,
    plies: g.tree.mainline.length,
    variations: [...g.tree.variations.values()].reduce((n, lines) => n + lines.length, 0),
    comments: 0,
    errors: g.tree.errors.length,
  }), { ...EMPTY_STATS, comments: remarks })
}

/** The comments of the commentary database that come from a book (its source, matched by title or book id); 0 when it knows none or cannot be read. */
export async function bookCommentCount(bookId: number | string, title: string): Promise<number> {
  try {
    const source = matchSource(await loadCommentSources(), title, bookId)
    if (!source) return 0
    return source.comments ?? (await loadCommentPage({ source: source.id }, 0, 1)).total
  } catch {
    return 0
  }
}

/** The numbers with the comments the database holds for the book (the ones written into its text only when it holds none). */
async function withDatabaseComments(sum: StatsCounts, bookId: number | string, title: string): Promise<StatsCounts> {
  const fromDatabase = title ? await bookCommentCount(bookId, title) : 0
  return fromDatabase > 0 ? { ...sum, comments: fromDatabase } : sum
}

/** The numbers of chapters already in memory (a resources-repository book). */
export async function computeChaptersStats(chapters: { html: string }[], bookId: number | string, title: string, onProgress?: (done: number, total: number) => void, signal?: AbortSignal): Promise<BookStats | null> {
  let sum = EMPTY_STATS
  for (let i = 0; i < chapters.length; i++) {
    if (signal?.aborted) return null
    try { sum = addStats(sum, chapterStats(chapters[i].html)) } catch { /* counts as nothing */ }
    onProgress?.(i + 1, chapters.length)
    await new Promise((r) => setTimeout(r, 0))
  }
  return { ...(await withDatabaseComments(sum, bookId, title)), analysedAt: new Date().toISOString(), version: APP_VERSION }
}

/** Every chapter of a library book, one at a time; `onProgress(done, total)`; stops quietly when `signal` aborts (the result is then null). */
export async function computeBookStats(bookId: number, title: string, onProgress?: (done: number, total: number) => void, signal?: AbortSignal): Promise<BookStats | null> {
  let sum = EMPTY_STATS
  let total = 1
  for (let c = 1; c <= total; c++) {
    if (signal?.aborted) return null
    try {
      const ch = await fetchBookChapter(bookId, c)
      if (c === 1) total = Math.max(1, ...ch.toc.map((t) => t.order))
      sum = addStats(sum, chapterStats(ch.html))
    } catch { /* a chapter that cannot be read counts as nothing */ }
    onProgress?.(c, total)
  }
  return signal?.aborted ? null : { ...(await withDatabaseComments(sum, bookId, title)), analysedAt: new Date().toISOString(), version: APP_VERSION }
}

const key = (id: number | string) => `bookstats:${id}`

/** Where the numbers of a resources-repository book are kept: the only folder the write token may write to. */
export const statsPath = (title: string) => `suggestions/stats/${bookSlug(title)}/stats.json`

const readLocal = (id: number | string): BookStats | null => {
  try {
    const raw = localStorage.getItem(key(id))
    return raw ? (JSON.parse(raw) as BookStats) : null
  } catch {
    return null
  }
}

/**
 * The stored numbers of a book: of a library book (number id) from the server,
 * of a resources-repository book (string id) from the repository; else this
 * browser's copy. Null when never computed.
 */
export async function loadBookStats(id: number | string, title = ''): Promise<BookStats | null> {
  try {
    if (typeof id === 'number') {
      if (hasServerSession()) {
        const r = await httpClient<{ stats: BookStats | null }>(`/api/library/books/${id}/stats`)
        if (r.stats) return r.stats
      }
    } else if (title) {
      return await getJson<BookStats>(statsPath(title))
    }
  } catch { /* the browser's copy */ }
  return readLocal(id)
}

/** Keep the numbers of a book: in this browser, and in the server (library book) or the repository (when the write token is set). */
export async function saveBookStats(id: number | string, stats: BookStats, title = ''): Promise<void> {
  try { localStorage.setItem(key(id), JSON.stringify(stats)) } catch { /* storage full or blocked */ }
  if (typeof id === 'number') {
    if (hasServerSession()) await httpClient(`/api/library/books/${id}/stats`, { method: 'PUT', body: JSON.stringify(stats) })
  } else if (title && canWriteResources()) {
    await writeResourceFile(statsPath(title), `${JSON.stringify(stats)}\n`, `stats: ${title}`)
  }
}
