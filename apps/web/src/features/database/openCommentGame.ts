import { EXTERNAL_BOOK_ID, useExternalBookStore } from '../../shared/externalBook/externalBookStore'
import { saveProgress } from '../library/store/readingStore'
import { pgnToChapters } from '../gamesearch/pgnChapters'
import { loadCommentGame } from '../comments/commentsApi'

/** What is known of the game a comment was taken from. */
export interface CommentGameRef { gameId: string; annotator: string; white?: string | null; black?: string | null; label?: string | null }

/** Read the game of a comment and open it in the reader; resolves to the route to go to. */
export async function openCommentGame(ref: CommentGameRef): Promise<string> {
  const g = await loadCommentGame(ref.gameId)
  const white = g.white ?? ref.white ?? null
  const black = g.black ?? ref.black ?? null
  const name = [white, black].filter(Boolean).join(' – ') || ref.label || `Game ${ref.gameId}`
  const tags = [['White', g.white ?? '?'], ['Black', g.black ?? '?'], ['Annotator', ref.annotator]].map(([k, v]) => `[${k} "${v.replace(/"/g, "'")}"]`).join('\n')
  const { chapters } = pgnToChapters(`${tags}\n\n${g.pgn}`, { fromPosition: true })
  if (!chapters.length) throw new Error('the game could not be read')
  saveProgress(EXTERNAL_BOOK_ID, 1)
  useExternalBookStore.getState().open(name, chapters)
  return `/read/${EXTERNAL_BOOK_ID}`
}
