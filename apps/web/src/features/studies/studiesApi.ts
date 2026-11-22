import { httpClient } from '../../shared/api/httpClient'

export interface Study {
  id: string
  name: string
  author: string | null
  chapters: number
  games: number
  comments: number
  linkedIds: string[]
  groupId: string | null
  partOrder: number | null
  isBook: boolean
  source: 'lichess' | 'comments'
  updatedAt: string | null
  importedAt: string | null
  myRating: number | null
  lichessLikes: number | null
}

export interface StudyAuthor { author: string; count: number }
export interface StudyList { studies: Study[]; authors: StudyAuthor[] }
export interface ImportOptions { follow?: boolean; depth?: number; max?: number; parts?: string[] }
export interface ImportResult {
  imported: Study[]
  skipped: { id: string; reason: string }[]
  linked: string[]
  errors: { id: string; message: string }[]
}
export interface UserStudy { id: string; name: string; createdAt: number | string | null; updatedAt: number | string | null; imported: boolean }
export interface SortQuery { sort?: string; dir?: 'asc' | 'desc'; author?: string; q?: string }

/** What the importer and the tab need from the server; faked in tests. */
export interface StudiesClient {
  list(query?: SortQuery): Promise<StudyList>
  get(id: string): Promise<{ study: Study; pgn: string }>
  importStudy(ref: string, options?: ImportOptions): Promise<ImportResult>
  listUser(handle: string): Promise<{ user: string; studies: UserStudy[] }>
  update(id: string, patch: { myRating?: number | null; lichessLikes?: number | null }): Promise<Study>
  remove(id: string, withGroup?: boolean): Promise<number>
  syncComments(): Promise<{ added: number; studies: number }>
}

const json = (method: string, body?: unknown): RequestInit => ({ method, ...(body === undefined ? {} : { body: JSON.stringify(body) }) })

export const studiesApi: StudiesClient = {
  list(query = {}) {
    const p = new URLSearchParams()
    for (const [k, v] of Object.entries(query)) if (v) p.set(k, String(v))
    const qs = p.toString()
    return httpClient<StudyList>(`/api/studies${qs ? `?${qs}` : ''}`, json('GET'))
  },
  get: (id) => httpClient<{ study: Study; pgn: string }>(`/api/studies/${encodeURIComponent(id)}`, json('GET')),
  importStudy: (ref, options = {}) => httpClient<ImportResult>('/api/studies/import', json('POST', { ref, ...options })),
  listUser: (handle) => httpClient<{ user: string; studies: UserStudy[] }>(`/api/studies/lichess/user/${encodeURIComponent(handle)}`, json('GET')),
  async update(id, patch) {
    return (await httpClient<{ study: Study }>(`/api/studies/${encodeURIComponent(id)}`, json('PUT', patch))).study
  },
  async remove(id, withGroup = false) {
    return (await httpClient<{ deleted: number }>(`/api/studies/${encodeURIComponent(id)}${withGroup ? '?group=1' : ''}`, json('DELETE'))).deleted
  },
  syncComments: () => httpClient<{ added: number; studies: number }>('/api/studies/sync-comments', json('POST')),
}
