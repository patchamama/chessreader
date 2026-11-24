import { httpClient } from '../../shared/api/httpClient'
import { withChapterErrata } from '../library/errata/chapterErrata'
import { prepareChapterHtml } from '../library/utils/epubContent'
import { htmlToProseText } from '../library/utils/proseText'
import { gamesOfText, type BookInfo, type GeneratedGame } from './gamePgn'

/** A chapter as the recognition reads it: the same text the reader shows (errata applied). */
export interface ChapterText {
  text: string
  title: string
  toc: { order: number; title: string }[]
}
export type ChapterLoader = (chapter: number) => Promise<ChapterText>

/** Loads a library book's chapters from the server, with its errata applied, like the reader does. */
export function serverChapterLoader(bookId: number, options: { bookTitle: string | null; titleSeparator?: string }): ChapterLoader {
  return async (chapter) => {
    const loaded = await httpClient<{ title?: string; html: string; toc?: { order: number; title: string }[] }>(`/api/library/books/${bookId}/chapters/${chapter}`)
    const html = (await withChapterErrata(loaded.html, options.bookTitle, chapter)).html
    return {
      text: htmlToProseText(prepareChapterHtml(html, bookId, { titleSeparator: options.titleSeparator })),
      title: loaded.title ?? '',
      toc: loaded.toc ?? [],
    }
  }
}

/** The chapter numbers of the book (from the table of contents of its first chapter). */
export async function bookChapterOrders(load: ChapterLoader): Promise<number[]> {
  const first = await load(1)
  const orders = [...new Set(first.toc.map((e) => e.order))].sort((a, b) => a - b)
  return orders.length > 0 ? orders : [1]
}

export interface GenerateOptions {
  algorithm?: 1 | 2
  signal?: AbortSignal
  onProgress?: (done: number, total: number) => void
}
export interface GenerateResult { games: GeneratedGame[]; failedChapters: number[] }

/** The commented PGN of every recognised game of the given chapters, in reading order. */
export async function generateBookGames(book: BookInfo, chapters: number[], load: ChapterLoader, options: GenerateOptions = {}): Promise<GenerateResult> {
  const games: GeneratedGame[] = []
  const failedChapters: number[] = []
  let done = 0
  for (const chapter of chapters) {
    if (options.signal?.aborted) throw new DOMException('Cancelled', 'AbortError')
    try {
      const { text, title } = await load(chapter)
      games.push(...gamesOfText(text, { book, chapter, chapterTitle: title }, options.algorithm))
    } catch {
      failedChapters.push(chapter)
    }
    options.onProgress?.(++done, chapters.length)
  }
  return { games, failedChapters }
}

/** All the games as one PGN file (games separated by a blank line). */
export function joinPgns(games: GeneratedGame[]): string {
  return games.map((g) => g.pgn.trimEnd()).join('\n\n') + '\n'
}

const safe = (s: string) => s.replace(/[\\/:*?"<>|]+/g, '').replace(/\s+/g, ' ').trim().slice(0, 40)
/** One file name per game: chapter, game number and players. */
export function gameFileName(g: GeneratedGame): string {
  const players = [g.white, g.black].filter(Boolean).map(safe).filter(Boolean).join(' - ')
  return `ch${String(g.chapter).padStart(2, '0')}-game${String(g.gameIndex + 1).padStart(2, '0')}${players ? ` ${players}` : ''}.pgn`
}
