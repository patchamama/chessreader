import type { CommentSource } from '../../comments/commentsApi'

/** Lower case, no accents, every run of other characters a single space: "¡Al ataque!" → "al ataque". */
const plain = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim()

/**
 * The commentary-database source of a library book. The database names a book by
 * its short title ("Mis geniales predecesores I") and the library by its full one
 * ("Mis geniales predecesores I. De Steinitz a Alekhine"): a source matches when
 * its title is the book's or starts it, as whole words (so "… I" never matches "… II").
 * The source that records the book's id wins; else the longest title. Never a Lichess source.
 */
export function matchSource<T extends Pick<CommentSource, 'title' | 'kind' | 'book'>>(sources: T[], title: string, bookId?: number | string): T | null {
  const books = sources.filter((s) => s.kind !== 'lichess')
  const byId = bookId !== undefined ? books.find((s) => s.book !== null && String(s.book) === String(bookId)) : undefined
  if (byId) return byId
  const want = plain(title)
  const hits = books.filter((s) => { const t = plain(s.title); return t !== '' && (want === t || want.startsWith(`${t} `)) })
  return hits.sort((a, b) => plain(b.title).length - plain(a.title).length)[0] ?? null
}
