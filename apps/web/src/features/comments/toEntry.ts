import type { HumanComment } from '../library/commentdb/commentLookup'
import type { CommentEntry } from './commentsApi'

/** A listed comment as the entry the details editor takes. */
export function toEntry(c: HumanComment, fen: string): CommentEntry {
  return {
    id: c.id ?? 0, hash: '', fen, text: c.text, lang: c.lang, ply: c.ply, move: Math.ceil(c.ply / 2), san: c.san, gameId: c.gameId, chapter: null,
    source: { id: 0, title: c.source.title, author: c.source.author, kind: c.source.kind, lang: c.lang, book: null },
    game: { white: null, black: null, label: c.label }, translations: c.translations,
  }
}
