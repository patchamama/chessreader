import { hasServerSession } from '../../../shared/api/serverSession'
import { httpClient } from '../../../shared/api/httpClient'
import { canWriteResources, writeResourceFile } from '../../suggestions/suggestionsApi'
import { bookSlug } from '../errata/errataFormat'

/** The latest request of a book (the listing's `commentRequest`). */
export type CommentRequestState = 'pending' | 'done' | 'rejected' | null | undefined

export const MAX_NOTE = 500

export interface RequestableBook { id: number | string; title: string; language?: string }

export type RequestCommentsResult =
  | { saved: true; where: 'server' | 'resources'; status: 'pending' }
  /** Not stored anywhere: the JSON to add to the resources repository at `path`. */
  | { saved: false; path: string; json: string; reason?: string }

/**
 * Asks for the comments of a book to be added to the commentary database: on
 * the server when there is one (idempotent: a second request returns the
 * pending one), else as a file of the resources repository (write token), else
 * the JSON is given to download.
 */
export async function requestBookComments(book: RequestableBook, note = ''): Promise<RequestCommentsResult> {
  const slug = bookSlug(book.title) || 'book'
  const id = `${slug}-${Date.now().toString(36)}`
  const path = `suggestions/book-comments/${slug}/${id}.json`
  const json = JSON.stringify({ kind: 'book-comments', book: book.title, language: book.language ?? '', note, requestedAt: new Date().toISOString() }, null, 2)
  let reason: string | undefined
  if (typeof book.id === 'number' && hasServerSession()) {
    try {
      await httpClient(`/api/library/books/${book.id}/comment-request`, { method: 'POST', body: JSON.stringify({ note }) })
      return { saved: true, where: 'server', status: 'pending' }
    } catch (e) {
      reason = (e as Error).message
    }
  }
  if (canWriteResources()) {
    try {
      await writeResourceFile(path, `${json}\n`, `suggestion: book-comments for ${slug}`)
      return { saved: true, where: 'resources', status: 'pending' }
    } catch (e) {
      reason = (e as Error).message
    }
  }
  return reason ? { saved: false, path, json, reason } : { saved: false, path, json }
}

/** Cancels the pending request of a book (server only). */
export async function cancelBookCommentRequest(bookId: number): Promise<void> {
  await httpClient(`/api/library/books/${bookId}/comment-request`, { method: 'DELETE' })
}
