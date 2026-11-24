import { httpClient } from '../../shared/api/httpClient'

export type PgnStatus = 'new' | 'reviewed' | 'rejected'
export type PgnResult = '1-0' | '0-1' | '1/2-1/2' | '*'

export interface GeneratedPgnSummary {
  id: number
  bookId: number
  bookTitle: string
  chapter: number
  gameIndex: number
  white: string
  black: string
  event: string
  result: PgnResult
  status: PgnStatus
  createdBy: number | null
  createdAt: string
  updatedAt: string
  lichessUrl: string | null
  /** The reader is the author or an admin: may edit, review, delete and upload it. */
  canWrite: boolean
}
export interface GeneratedPgnItem extends GeneratedPgnSummary { pgn: string }
export interface GeneratedPgnBook { bookId: number; bookTitle: string; count: number }
export interface NewGeneratedGame {
  bookId: number
  bookTitle: string
  chapter: number
  gameIndex: number
  white: string
  black: string
  event: string
  result: PgnResult
  pgn: string
}
export interface GeneratedPgnPatch { status?: PgnStatus; pgn?: string; white?: string; black?: string; event?: string; result?: PgnResult }
export interface LichessUploadResult {
  url: string
  chapters: { id: string; name: string }[]
  visibility: 'private' | 'public'
  /** Always false: the Lichess API cannot set a study's visibility. */
  visibilityApplied: boolean
  note: string
}
export interface ListQuery { bookId?: number; status?: PgnStatus; q?: string }

/** What the generated-PGN area and the book button need from the server; faked in tests. */
export interface GeneratedPgnClient {
  list(query?: ListQuery): Promise<{ items: GeneratedPgnSummary[]; books: GeneratedPgnBook[] }>
  get(id: number): Promise<GeneratedPgnItem>
  create(games: NewGeneratedGame[]): Promise<{ created: number; updated: number; skipped: number }>
  update(id: number, patch: GeneratedPgnPatch): Promise<GeneratedPgnItem>
  remove(id: number): Promise<void>
  /** Adds the PGN to an existing study. The token goes in this one request and is never kept. */
  uploadToLichess(id: number, input: { studyId: string; visibility: 'private' | 'public'; token: string }): Promise<LichessUploadResult>
}

const json = (method: string, body?: unknown): RequestInit => ({ method, ...(body === undefined ? {} : { body: JSON.stringify(body) }) })
/** The server takes at most this many games in one request. */
export const MAX_GAMES_PER_REQUEST = 200

export const generatedPgnApi: GeneratedPgnClient = {
  list(query = {}) {
    const p = new URLSearchParams()
    if (query.bookId !== undefined) p.set('book_id', String(query.bookId))
    if (query.status) p.set('status', query.status)
    if (query.q) p.set('q', query.q)
    const qs = p.toString()
    return httpClient(`/api/generated-pgn${qs ? `?${qs}` : ''}`, json('GET'))
  },
  async get(id) { return (await httpClient<{ item: GeneratedPgnItem }>(`/api/generated-pgn/${id}`, json('GET'))).item },
  async create(games) {
    const total = { created: 0, updated: 0, skipped: 0 }
    for (let i = 0; i < games.length; i += MAX_GAMES_PER_REQUEST) {
      const r = await httpClient<typeof total>('/api/generated-pgn', json('POST', { games: games.slice(i, i + MAX_GAMES_PER_REQUEST) }))
      total.created += r.created
      total.updated += r.updated
      total.skipped += r.skipped
    }
    return total
  },
  async update(id, patch) { return (await httpClient<{ item: GeneratedPgnItem }>(`/api/generated-pgn/${id}`, json('PUT', patch))).item },
  async remove(id) { await httpClient(`/api/generated-pgn/${id}`, json('DELETE')) },
  uploadToLichess: (id, input) => httpClient(`/api/generated-pgn/${id}/lichess`, json('POST', input)),
}
