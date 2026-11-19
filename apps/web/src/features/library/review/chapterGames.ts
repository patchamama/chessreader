import { recognizeGames } from '@chess-ebook/chess-shared'
import type { RecognizedGame } from '@chess-ebook/chess-shared'
import { httpClient } from '../../../shared/api/httpClient'
import { EXTERNAL_BOOK_ID, ensureExternalChapters, useExternalBookStore } from '../../../shared/externalBook/externalBookStore'
import { withChapterErrata } from '../errata/chapterErrata'
import { prepareChapterHtml } from '../utils/epubContent'
import { htmlToProseText } from '../utils/proseText'

export interface ChapterGamesOptions {
  /** The book's title: its errata are filed by it. */
  bookTitle: string | null
  titleSeparator?: string
  algorithm?: 1 | 2
}

/**
 * The games of any chapter of a book, recognised on the same text the reader
 * shows (errata applied, chapter HTML prepared), to evaluate the whole book
 * without opening every chapter (reader-analysis-round S11).
 */
export async function loadChapterGames(bookId: number, chapter: number, options: ChapterGamesOptions): Promise<RecognizedGame[]> {
  let html: string
  if (bookId === EXTERNAL_BOOK_ID) {
    const kept = useExternalBookStore.getState().chapters
    const chapters = kept.length > 0 ? kept : await ensureExternalChapters()
    html = chapters[chapter - 1]?.html ?? ''
  } else {
    const loaded = await httpClient<{ html: string }>(`/api/library/books/${bookId}/chapters/${chapter}`)
    html = (await withChapterErrata(loaded.html, options.bookTitle, chapter)).html
  }
  const text = htmlToProseText(prepareChapterHtml(html, bookId, { titleSeparator: options.titleSeparator }))
  return recognizeGames(text, { algorithm: options.algorithm })
}
