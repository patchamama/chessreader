import { hasServerSession } from '../../shared/api/serverSession'
import { httpClient } from '../../shared/api/httpClient'
import { getJson, resourcesConfigured } from '../library/commentdb/commentLookup'
import { bookSlug, validateErrata, type ErrataEntry } from '../library/errata/errataFormat'
import type { ErrataIndex } from '../library/errata/errataSource'
import type { SuggestionOrigin } from './suggestionFormat'

/** An erratum shown in the suggestions review as a read-only 'move' item. */
export interface ErrataReviewEntry extends ErrataEntry {
  origin: SuggestionOrigin
}

const ERRATA_PATH = /^[a-z0-9-]+\/\d+-\d+\.json$/

/**
 * The errata of these books (by title), from the server (one request per
 * book) and from errata/index.json of the resources repository, merged by id
 * (the server copy wins). Never throws.
 */
export async function loadErrataForReview(bookTitles: string[]): Promise<ErrataReviewEntry[]> {
  const slugs = [...new Set(bookTitles.map(bookSlug).filter(Boolean))]
  const byId = new Map<string, ErrataReviewEntry>()
  if (hasServerSession()) {
    await Promise.all(slugs.map(async (slug) => {
      try {
        const r = await httpClient<{ entries?: unknown[] }>(`/api/errata?book=${encodeURIComponent(slug)}`, { method: 'GET' })
        for (const e of r.entries ?? []) if (validateErrata(e).length === 0) byId.set((e as ErrataEntry).id, { ...(e as ErrataEntry), origin: 'server' })
      } catch {
        // no errata for this book on the server
      }
    }))
  }
  if (resourcesConfigured()) {
    try {
      const index = await getJson<ErrataIndex>('errata/index.json')
      const wanted = (index.entries ?? []).filter((e) => ERRATA_PATH.test(e.path) && (!slugs.length || slugs.includes(e.book)))
      const files = await Promise.all(wanted.map((e) => getJson<unknown>(`errata/${e.path}`).catch(() => null)))
      for (const f of files) {
        if (f && validateErrata(f).length === 0 && !byId.has((f as ErrataEntry).id)) byId.set((f as ErrataEntry).id, { ...(f as ErrataEntry), origin: 'resources' })
      }
    } catch {
      // no errata index in the repository
    }
  }
  return [...byId.values()]
}
