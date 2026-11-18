import { getJson, getText } from '../library/commentdb/commentLookup'
import { textToChapters } from '../library/utils/textToChapters'
import { EXTERNAL_BOOK_ID, useExternalBookStore, type ExternalChapter } from '../../shared/externalBook/externalBookStore'
import { saveBoardMemory } from '../library/store/boardMemory'
import { saveProgress } from '../library/store/readingStore'
import { chapterErrors, type GameErrors } from './bookErrors'

/** A book of the private resources repository (books/manifest.json). */
export interface RepoBook { id: string; title: string; author: string | null; lang: string }

/** The books whose text is in the resources repository. */
export const loadRepoBooks = () => getJson<RepoBook[]>('books/manifest.json')

/** A book text of the repository (one chapter per form feed) as chapters the reader opens. */
export function textBookChapters(text: string, title: string): { title: string; chapters: ExternalChapter[] } {
  const parts = text.replace(/\r/g, '').split('\f').map((p) => p.trim()).filter(Boolean)
  const chapters = parts.map((p, i) => {
    const c = textToChapters(p, p.split('\n')[0].trim().slice(0, 80) || `${title} ${i + 1}`).chapters[0]
    return { title: c.title, html: c.html, toc: [] as ExternalChapter['toc'] }
  })
  const toc = chapters.map((c, i) => ({ order: i + 1, title: c.title }))
  return { title, chapters: chapters.map((c) => ({ ...c, toc })) }
}

/** Read a repository book and recognise every chapter: its games with their errors. */
export async function repoBookErrors(book: RepoBook, onProgress?: (done: number, total: number) => void, signal?: AbortSignal): Promise<{ games: GameErrors[]; chapters: ExternalChapter[] }> {
  const { chapters } = textBookChapters(await getText(`books/text/${encodeURIComponent(book.id)}.txt`), book.title)
  const games: GameErrors[] = []
  for (let i = 0; i < chapters.length; i++) {
    if (signal?.aborted) break
    games.push(...chapterErrors(book.id, i + 1, chapters[i].html))
    onProgress?.(i + 1, chapters.length)
    // Let the page breathe between chapters.
    if (i % 5 === 4) await new Promise((r) => setTimeout(r, 0))
  }
  return { games, chapters }
}

/** Open a game of a repository book in the reader (as the browser's own book), at that game. */
export function openRepoGame(book: RepoBook, chapters: ExternalChapter[], game: GameErrors): void {
  useExternalBookStore.getState().open(book.title, chapters)
  saveProgress(EXTERNAL_BOOK_ID, game.chapter)
  saveBoardMemory(EXTERNAL_BOOK_ID, { chapter: game.chapter, gameIndex: game.gameIndex, nodeId: null, annotations: {} })
}
