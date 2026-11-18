import { httpClient } from '../../../shared/api/httpClient'
import { isDemoHost } from '../../../shared/env/devMode'
import { useAuthStore } from '../../auth/store/authStore'
import { getJson } from '../commentdb/commentLookup'

/** A whole commented game of the comment database (what a book comment comes from). */
export interface CommentGame {
  id: string
  white?: string | null
  black?: string | null
  label?: string | null
  pgn: string
  source?: { title: string; author: string | null; kind: string } | number | null
}

/** The game: from the server's database when there is a server and a session, else from the static one (g/<id>.json). */
export async function loadCommentGame(id: string): Promise<CommentGame> {
  if (!isDemoHost() && useAuthStore.getState().token) {
    try {
      return await httpClient<CommentGame>(`/api/comments/games/${encodeURIComponent(id)}`, { method: 'GET' })
    } catch {
      // no database on the server: try the static one
    }
  }
  return getJson<CommentGame>(`g/${encodeURIComponent(id)}.json`)
}
