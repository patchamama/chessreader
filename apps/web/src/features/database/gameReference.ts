import { isDemoHost } from '../../shared/env/devMode'
import type { ExternalChapter } from '../../shared/externalBook/externalBookStore'

/** What the reference needs of a database game. */
export interface RefGame {
  id: string
  white?: string | null
  black?: string | null
  year?: number | null
  chapter?: number | null
  gameIndex?: number | null
  place?: string | null
}

/** Where the game comes from: its book of the resources (when known), Lichess, or only the book id. */
export interface RefSource {
  book: { id: string; title: string; author: string | null } | null
  lichess: boolean
  /** The book id of the game when that book is not among the resources' books. */
  bookId?: string
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

/** "White – Black (year)": the game's name, also the external book's title. */
export const gameName = (g: RefGame) => `${g.white ?? '?'} – ${g.black ?? '?'}${g.year ? ` (${g.year})` : ''}`

const sourceName = (src: RefSource) => (src.lichess ? 'Lichess' : src.book?.title ?? null)

/**
 * The chapter title of an opened database game: its book (or Lichess) and its
 * database id. The reader's top bar shows it after the book title (the game's
 * name), so together they read "White – Black (year) · Book · #id".
 */
export function gameChapterTitle(g: RefGame, src: RefSource): string {
  return [sourceName(src), `#${g.id}`].filter(Boolean).join(' · ')
}

/** The heading of the game's chapter: game and book, and the id ready to copy (outside the recognition). */
export function gameReferenceHeading(g: RefGame, src: RefSource): string {
  const title = [gameName(g), sourceName(src)].filter(Boolean).join(' · ')
  return `<h2 data-no-recognition>${esc(title)}</h2>\n`
    + `<p class="game-reference" data-no-recognition>Database id: <code class="select-all rounded bg-slate-100 px-1" style="user-select:all" title="Database id of this game (to suggest a change)">${esc(g.id)}</code></p>`
}

/** The game on Lichess: its Site when that is a Lichess address, or a Lichess game id ("AbCd1234", "lichess-AbCd1234"). */
export function lichessUrl(g: { id: string; place?: string | null }): string | null {
  if (g.place && /^https:\/\/lichess\.org\/\w+/.test(g.place)) return g.place
  const id = /^(?:lichess-)?([A-Za-z0-9]{8})$/.exec(g.id)?.[1]
  return id ? `https://lichess.org/${id}` : null
}

/** The database route that opens a book at a game (hash route in the deployed app). */
export function openInBookHref(bookId: string, chapter: number, gameIndex: number | null): string {
  const query = new URLSearchParams({ openBook: bookId, chapter: String(chapter), ...(gameIndex !== null ? { game: String(gameIndex) } : {}) })
  return `${isDemoHost() ? '#' : ''}/database?${query.toString()}`
}

/**
 * Where the game was taken from, for the end of its chapter: author and book
 * with a link that opens the game in the book (when the book is among the
 * resources and the chapter is known), or Lichess with a link to the game.
 */
export function gameSourceFooter(g: RefGame, src: RefSource): string {
  const wrap = (inner: string) => `<p class="game-source" data-no-recognition>${inner}</p>`
  if (src.lichess) {
    const url = lichessUrl(g)
    return wrap(`Source: Lichess${url ? ` · <a href="${esc(url)}" target="_blank" rel="noopener noreferrer">the game on Lichess</a>` : ''}`)
  }
  if (!src.book) return wrap(`Source: ${esc(src.bookId ?? 'unknown')}`)
  const { book } = src
  const cite = `${book.author ? `${esc(book.author)}, ` : ''}<cite>${esc(book.title)}</cite>`
  if (!g.chapter) return wrap(`Source: ${cite}`)
  const gameIndex = g.gameIndex ?? null
  const link = `<a class="open-game-in-book" href="${esc(openInBookHref(book.id, g.chapter, gameIndex))}" data-book="${esc(book.id)}" data-chapter="${g.chapter}"${gameIndex !== null ? ` data-game="${gameIndex}"` : ''}>Open this game in the book</a>`
  return wrap(`Source: ${cite} · ${link}`)
}

/** The chapter of an opened database game with its reference on top and its source at the end. */
export function withGameReference(chapter: ExternalChapter, g: RefGame, src: RefSource): ExternalChapter {
  const title = gameChapterTitle(g, src)
  const body = chapter.html.replace(/^\s*<h2>[\s\S]*?<\/h2>\s*/, '')
  return {
    ...chapter,
    title,
    html: `${gameReferenceHeading(g, src)}\n${body}\n${gameSourceFooter(g, src)}`,
    toc: chapter.toc.map((t, i) => (i === 0 ? { ...t, title } : t)),
  }
}
