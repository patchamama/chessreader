import { httpClient } from '../../shared/api/httpClient'
import { hasServerSession } from '../../shared/api/serverSession'
import { EXTERNAL_BOOK_ID } from '../../shared/externalBook/externalBookStore'
import { chapterHasText, loadRepoBookChapters, openRepoGame, type RepoBook } from '../errors/repoBooks'
import { saveBoardMemory } from '../library/store/boardMemory'
import { saveProgress } from '../library/store/readingStore'
import { markVisited } from '../../shared/visited/visitedStore'

/** Where a database game is in its book: chapter (1-based, one per form feed of the text) and index among the chapter's recognised games. */
export interface BookPlace { chapter: number; gameIndex: number | null }

const sameTitle = (a: string, b: string) => a.trim().toLocaleLowerCase() === b.trim().toLocaleLowerCase()
/** The library title adds a subtitle to the resources title ("Mis geniales predecesores I. De Steinitz a Alekhine"). */
const withSubtitle = (library: string, title: string) => {
  const l = library.trim().toLocaleLowerCase(), t = title.trim().toLocaleLowerCase()
  return l.startsWith(t) && /^\s*[.:,–—-]/.test(l.slice(t.length))
}

/**
 * The library chapter of a database chapter: the database counts only the
 * chapters with text, the library also an empty cover. Reads the chapters up to
 * the one asked for (a few more when some are empty); the database number when
 * they cannot be read.
 */
async function libraryChapterOf(bookId: number, n: number): Promise<number> {
  let seen = 0
  for (let i = 1; i <= n + 5; i++) {
    const chapter = await httpClient<{ html: string }>(`/api/library/books/${bookId}/chapters/${i}`).catch(() => null)
    if (typeof chapter?.html !== 'string') return n
    if (chapterHasText(chapter.html) && ++seen === n) return i
  }
  return n
}

/**
 * Open the book of a database game at that game, and return the reader's
 * route. With the server, a library book of the same title opens at that
 * chapter and game; otherwise (the deployed app, or no such library book) the
 * book's text in the resources opens as the browser's own book. Without a
 * game index the chapter opens at its first game.
 */
export async function openGameInBook(book: RepoBook, place: BookPlace): Promise<string> {
  const gameIndex = place.gameIndex ?? 0
  if (hasServerSession()) {
    const library = await httpClient<{ id: number; title: string }[]>('/api/library/books').catch(() => [])
    const match = library.find((b) => sameTitle(b.title, book.title)) ?? library.find((b) => withSubtitle(b.title, book.title))
    if (match) {
      const chapter = await libraryChapterOf(match.id, place.chapter)
      saveProgress(match.id, chapter)
      markVisited('serverBook', match.id)
      saveBoardMemory(match.id, { chapter, gameIndex, nodeId: null, annotations: {} })
      return `/read/${match.id}`
    }
  }
  const chapters = await loadRepoBookChapters(book)
  openRepoGame(book, chapters, { chapter: place.chapter, gameIndex })
  return `/read/${EXTERNAL_BOOK_ID}`
}
