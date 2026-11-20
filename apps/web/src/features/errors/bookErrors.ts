import { recognizeGames, type RecognitionError, type RecognizedGame } from '@chess-ebook/chess-shared'
import { httpClient } from '../../shared/api/httpClient'
import { htmlToProseText } from '../library/utils/proseText'
import type { Chapter } from '../library/api/libraryApi'

/** The recognition errors of one game of a book. */
export interface GameErrors {
  /** A library book (number) or a book of the resources repository (its id). */
  bookId: number | string
  chapter: number
  gameIndex: number
  /** The first moves of the game, to tell it apart. */
  label: string
  moves: number
  errors: RecognitionError[]
}

/** One chapter's text and its recognised games, numbered as the errors are. */
export function chapterGames(html: string, algorithm: 1 | 2 = 2): { text: string; games: RecognizedGame[] } {
  const text = htmlToProseText(html)
  return { text, games: recognizeGames(text, { algorithm }) }
}

/** The line before a game (its players, when short) and its first moves, to tell it apart. */
export function gameLabel(text: string, g: RecognizedGame): string {
  const main = g.tree.mainline.map((id) => g.tree.nodes.get(id)!)
  const before = text.slice(Math.max(0, g.charStart - 200), g.charStart).split('\n').map((l) => l.trim()).filter(Boolean).pop() ?? ''
  return (before.length < 80 && !/\d+\./.test(before) ? `${before} · ` : '') + main.slice(0, 4).map((n) => n.san).join(' ')
}

/** A chapter of a library book. */
export const fetchBookChapter = (bookId: number, chapter: number) => httpClient<Chapter>(`/api/library/books/${bookId}/chapters/${chapter}`)

/** Recognise one chapter's text and list its games with their errors. */
export function chapterErrors(bookId: number | string, chapter: number, html: string, algorithm: 1 | 2 = 2): GameErrors[] {
  const { text, games } = chapterGames(html, algorithm)
  return games.map((g, gameIndex) => ({
    bookId, chapter, gameIndex, label: gameLabel(text, g), moves: Math.ceil(g.tree.mainline.length / 2), errors: g.tree.errors,
  }))
}

/** Every chapter of a book, recognised: its games with their errors (one chapter at a time). */
export async function bookErrors(bookId: number, onProgress?: (done: number, total: number) => void, signal?: AbortSignal): Promise<GameErrors[]> {
  const out: GameErrors[] = []
  let total = 1
  for (let c = 1; c <= total; c++) {
    if (signal?.aborted) break
    try {
      const ch = await fetchBookChapter(bookId, c)
      if (c === 1) total = Math.max(1, ...ch.toc.map((t) => t.order))
      out.push(...chapterErrors(bookId, c, ch.html))
    } catch { /* a chapter that cannot be read is skipped */ }
    onProgress?.(c, total)
  }
  return out
}

/** Errors by kind, for the summary row of a book. */
export function errorKinds(games: GameErrors[]): Record<string, number> {
  const out: Record<string, number> = {}
  for (const g of games) for (const e of g.errors) out[e.kind] = (out[e.kind] ?? 0) + 1
  return out
}
