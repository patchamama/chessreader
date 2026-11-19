import { getJson, getText, resourcesApiUrl } from '../library/commentdb/commentLookup'
import { parseEpub } from '../../shared/epub/epubBook'
import { useSettingsStore } from '../../shared/settings/settingsStore'
import { textToChapters } from '../library/utils/textToChapters'
import { EXTERNAL_BOOK_ID, registerExternalSourceLoader, useExternalBookStore, type ExternalChapter } from '../../shared/externalBook/externalBookStore'
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

/**
 * A binary file of the resources repository (an EPUB), read like getText: the
 * GitHub contents API serves files over 1 MB (up to 100 MB) only as raw content.
 */
async function getBytes(path: string): Promise<Uint8Array> {
  const { commentDbUrl, commentDbToken } = useSettingsStore.getState()
  const url = `${resourcesApiUrl(commentDbUrl)}/${path}`
  const headers: Record<string, string> = {}
  let host = ''
  try { const u = new URL(url); host = u.protocol === 'https:' ? u.hostname : '' } catch { /* not a URL */ }
  if (host === 'api.github.com') headers.Accept = 'application/vnd.github.raw+json'
  // The token is for GitHub: it never goes to any other host.
  if (commentDbToken && (host === 'api.github.com' || host === 'raw.githubusercontent.com')) headers.Authorization = `Bearer ${commentDbToken}`
  const r = await fetch(url, Object.keys(headers).length ? { headers } : undefined)
  if (!r.ok) throw new Error(String(r.status))
  return new Uint8Array(await r.arrayBuffer())
}

/** Chapters of a repository book from its EPUB: the book's stylesheet, images, headings and TOC titles. */
async function epubBookChapters(id: string): Promise<ExternalChapter[]> {
  const { chapters } = parseEpub(await getBytes(`books/epub/${encodeURIComponent(id)}.epub`))
  if (chapters.length === 0) throw new Error('The EPUB has no chapters')
  const toc = chapters.map((c, i) => ({ order: i + 1, title: c.title }))
  return chapters.map((c) => ({ title: c.title, html: c.html, toc }))
}

/** Books read in this session (an EPUB can be tens of MB, and its images are object URLs). */
const bookCache = new Map<string, Promise<ExternalChapter[]>>()

/** Test hook: forget the books read. */
export function clearRepoBookCache(): void {
  bookCache.clear()
}

/**
 * A repository book as the chapters the reader opens: from its EPUB (as the
 * server shows it), else from its text when the EPUB cannot be read.
 */
export function loadRepoBookChapters(book: Pick<RepoBook, 'id' | 'title'>): Promise<ExternalChapter[]> {
  const cached = bookCache.get(book.id)
  if (cached) return cached
  const loading = epubBookChapters(book.id).catch(async () =>
    textBookChapters(await getText(`books/text/${encodeURIComponent(book.id)}.txt`), book.title).chapters)
  bookCache.set(book.id, loading)
  // A book that could not be read at all is tried again next time.
  loading.catch(() => bookCache.delete(book.id))
  return loading
}

/** Read a repository book and recognise every chapter: its games with their errors. */
export async function repoBookErrors(book: RepoBook, onProgress?: (done: number, total: number) => void, signal?: AbortSignal): Promise<{ games: GameErrors[]; chapters: ExternalChapter[] }> {
  const chapters = await loadRepoBookChapters(book)
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
export function openRepoGame(book: RepoBook, chapters: ExternalChapter[], game: Pick<GameErrors, 'chapter' | 'gameIndex'>): void {
  useExternalBookStore.getState().open(book.title, chapters)
  saveProgress(EXTERNAL_BOOK_ID, game.chapter)
  saveBoardMemory(EXTERNAL_BOOK_ID, { chapter: game.chapter, gameIndex: game.gameIndex, nodeId: null, annotations: {} })
}

/** Open a whole repository book in the reader (as the browser's own book), at its first chapter. */
export async function openRepoBook(book: Pick<RepoBook, 'id' | 'title'>): Promise<void> {
  const chapters = await loadRepoBookChapters(book)
  useExternalBookStore.getState().open(book.title, chapters, { kind: 'repo', id: book.id })
  saveProgress(EXTERNAL_BOOK_ID, 1)
  saveBoardMemory(EXTERNAL_BOOK_ID, { chapter: 1, gameIndex: 0, nodeId: null, annotations: {} })
}

// A resources book is kept by its id: after a refresh it is read again from the repo.
registerExternalSourceLoader('repo', (source, title) => loadRepoBookChapters({ id: source.id, title }))
