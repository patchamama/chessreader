import { httpClient } from '../../shared/api/httpClient'
import { isDemoHost } from '../../shared/env/devMode'
import { EXTERNAL_BOOK_ID } from '../../shared/externalBook/externalBookStore'
import { useAuthStore } from '../auth/store/authStore'
import { loadRepoBookChapters, openRepoGame, type RepoBook } from '../errors/repoBooks'
import { saveBoardMemory } from '../library/store/boardMemory'
import { saveProgress } from '../library/store/readingStore'

/** Where a database game is in its book: chapter (1-based, one per form feed of the text) and index among the chapter's recognised games. */
export interface BookPlace { chapter: number; gameIndex: number | null }

const sameTitle = (a: string, b: string) => a.trim().toLocaleLowerCase() === b.trim().toLocaleLowerCase()

/**
 * Open the book of a database game at that game, and return the reader's
 * route. With the server, a library book of the same title opens at that
 * chapter and game; otherwise (the deployed app, or no such library book) the
 * book's text in the resources opens as the browser's own book. Without a
 * game index the chapter opens at its first game.
 */
export async function openGameInBook(book: RepoBook, place: BookPlace): Promise<string> {
  const gameIndex = place.gameIndex ?? 0
  if (!isDemoHost() && useAuthStore.getState().token) {
    const library = await httpClient<{ id: number; title: string }[]>('/api/library/books').catch(() => [])
    const match = library.find((b) => sameTitle(b.title, book.title))
    if (match) {
      saveProgress(match.id, place.chapter)
      saveBoardMemory(match.id, { chapter: place.chapter, gameIndex, nodeId: null, annotations: {} })
      return `/read/${match.id}`
    }
  }
  const chapters = await loadRepoBookChapters(book)
  openRepoGame(book, chapters, { chapter: place.chapter, gameIndex })
  return `/read/${EXTERNAL_BOOK_ID}`
}
