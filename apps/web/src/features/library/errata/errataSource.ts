import { hasServerSession } from '../../../shared/api/serverSession'
import { httpClient } from '../../../shared/api/httpClient'
import { getJson, resourcesConfigured } from '../commentdb/commentLookup'
import { bookSlug, errataPath, validateErrata, type ErrataEntry } from './errataFormat'

/** errata/index.json of the resources repository: one line per entry. */
export interface ErrataIndex {
  version: 1
  entries: { book: string; title?: string; chapter: number; gameIndex: number; path: string }[]
}

const valid = (list: unknown[]): ErrataEntry[] => list.filter((e) => validateErrata(e).length === 0) as ErrataEntry[]

/**
 * The errata of one chapter of a book: from the server when there is one,
 * else (or when it has none) from errata/index.json of the resources
 * repository set in Settings. Never throws: no errata is an empty list.
 */
export async function fetchChapterErrata(bookTitle: string, chapter: number): Promise<ErrataEntry[]> {
  const slug = bookSlug(bookTitle)
  if (!slug) return []
  if (hasServerSession()) {
    try {
      const r = await httpClient<{ entries: unknown[] }>(`/api/errata?book=${encodeURIComponent(slug)}&chapter=${chapter}`, { method: 'GET' })
      const entries = valid(r.entries ?? [])
      if (entries.length) return entries
    } catch {
      // no errata on the server: try the repository
    }
  }
  if (!resourcesConfigured()) return []
  try {
    const index = await getJson<ErrataIndex>('errata/index.json')
    const wanted = (index.entries ?? []).filter((e) => e.book === slug && e.chapter === chapter && /^[a-z0-9-]+\/\d+-\d+\.json$/.test(e.path))
    const files = await Promise.all(wanted.map((e) => getJson<unknown>(`errata/${e.path}`).catch(() => null)))
    return valid(files.filter((f) => f !== null))
  } catch {
    return []
  }
}

export type SaveErrataResult =
  | { saved: true; path: string }
  /** Not saved on a server: the JSON to add to the resources repository at `path`. */
  | { saved: false; path: string; json: string; reason?: string }

/** Stores an entry on the server; without one (or when it refuses), gives the JSON to copy into the repository. */
export async function saveErrata(entry: ErrataEntry): Promise<SaveErrataResult> {
  const offline = { saved: false as const, path: `errata/${errataPath(entry)}`, json: JSON.stringify(entry, null, 2) }
  if (!hasServerSession()) return offline
  try {
    const r = await httpClient<{ path: string }>('/api/errata', { method: 'POST', body: JSON.stringify(entry) })
    return { saved: true, path: r.path }
  } catch (e) {
    return { ...offline, reason: (e as Error).message }
  }
}
