import { hasServerSession } from '../../shared/api/serverSession'
import { httpClient } from '../../shared/api/httpClient'
import { useSettingsStore } from '../../shared/settings/settingsStore'
import { getJson, resourcesApiUrl, resourcesConfigured } from '../library/commentdb/commentLookup'
import { bookSlug } from '../library/errata/errataFormat'
import { applySuggestionsToHtml } from './suggestionApply'
import {
  suggestionPath, validateSuggestion,
  type LoadedSuggestion, type Suggestion, type SuggestionKind, type SuggestionOrigin, type SuggestionStatus,
} from './suggestionFormat'

/**
 * Where suggestions are kept (user decision, 2026-11-20): with a backend, in
 * its database (/api/suggestions); in the deploy, committed to the resources
 * repository under suggestions/ with the write token of Settings (sent only to
 * api.github.com); without either, the JSON is given to download. The review
 * list reads both the backend and the repository and merges them by id.
 */

/** suggestions/index.json of the resources repository: one line per suggestion. */
export interface SuggestionIndex {
  version: 1
  entries: SuggestionIndexEntry[]
}
export interface SuggestionIndexEntry {
  id: string
  kind: SuggestionKind
  /** The book slug. */
  book: string
  chapter: number | null
  /** Relative to suggestions/. */
  path: string
  status: SuggestionStatus
}

export type SaveSuggestionResult =
  | { saved: true; where: SuggestionOrigin; path: string }
  /** Not stored anywhere: the JSON to add to the resources repository at `path`. */
  | { saved: false; path: string; json: string; reason?: string }

export interface SuggestionFilter {
  kind?: SuggestionKind
  /** The book title (or slug). */
  book?: string
  status?: SuggestionStatus
  chapter?: number
}

const INDEX = 'suggestions/index.json'
const INDEX_PATH = /^[a-z-]+\/[a-z0-9-]+\/[A-Za-z0-9._-]{1,120}\.json$/
/** The only paths the write token may be used for. */
const WRITABLE_PATH = /^suggestions\/(index\.json|[a-z-]+\/[a-z0-9-]+\/[A-Za-z0-9._-]+\.json)$/
const PAGE = 500
const MAX_PAGES = 40

function writeToken(): string {
  return ((useSettingsStore.getState() as { resourcesWriteToken?: string }).resourcesWriteToken ?? '').trim()
}

/** The GitHub contents API of the resources repository, or null when it is not a GitHub repository. */
function githubContentsBase(): string | null {
  const base = resourcesApiUrl(useSettingsStore.getState().commentDbUrl ?? '')
  try {
    const u = new URL(base)
    if (u.protocol !== 'https:' || u.hostname !== 'api.github.com') return null
  } catch {
    return null
  }
  return /^https:\/\/api\.github\.com\/repos\/[\w.-]+\/[\w.-]+\/contents$/.test(base) ? base : null
}

function canCommit(): boolean {
  return !!writeToken() && githubContentsBase() !== null
}

const toBase64 = (text: string) => {
  const bytes = new TextEncoder().encode(text)
  let bin = ''
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(bin)
}
const fromBase64 = (b64: string) => new TextDecoder().decode(Uint8Array.from(atob(b64.replace(/\s+/g, '')), (c) => c.charCodeAt(0)))

/** A request to the GitHub contents API with the write token; only ever to api.github.com. */
async function github(path: string, init: RequestInit = {}): Promise<Response> {
  const base = githubContentsBase()
  const token = writeToken()
  if (!base || !token) throw new Error('no resources repository to write to')
  if (!WRITABLE_PATH.test(path) || path.split('/').some((seg) => seg === '.' || seg === '..')) throw new Error('the write token is only used for suggestions/ files')
  const url = `${base}/${path.split('/').map(encodeURIComponent).join('/')}`
  if (new URL(url).hostname !== 'api.github.com') throw new Error('the write token is only sent to api.github.com')
  return fetch(url, {
    ...init,
    cache: 'no-store',
    headers: { Accept: 'application/vnd.github+json', Authorization: `Bearer ${token}`, 'X-GitHub-Api-Version': '2022-11-28' },
  })
}

/** The current file (its sha and text), or null when it does not exist yet. */
async function readFile(path: string): Promise<{ sha: string; text: string } | null> {
  const r = await github(path)
  if (r.status === 404) return null
  if (!r.ok) throw new Error(String(r.status))
  const body = (await r.json()) as { sha?: string; content?: string }
  return { sha: String(body.sha ?? ''), text: body.content ? fromBase64(body.content) : '' }
}

async function writeFile(path: string, text: string, sha: string | undefined, message: string): Promise<void> {
  const r = await github(path, { method: 'PUT', body: JSON.stringify({ message, content: toBase64(text), ...(sha ? { sha } : {}) }) })
  if (!r.ok) throw new Error(String(r.status))
}

const indexEntry = (s: Suggestion): SuggestionIndexEntry => ({
  id: s.id, kind: s.kind, book: bookSlug(s.target.book), chapter: s.target.chapter ?? null,
  path: suggestionPath(s).slice('suggestions/'.length), status: s.status,
})

/** Commits the suggestion file and its line of suggestions/index.json (one retry when the index changed meanwhile). */
async function commitToResources(s: Suggestion, message: string): Promise<string> {
  const path = suggestionPath(s)
  const existing = await readFile(path)
  await writeFile(path, `${JSON.stringify(s, null, 2)}\n`, existing?.sha, message)
  for (let attempt = 0; ; attempt++) {
    try {
      const current = await readFile(INDEX)
      let index: SuggestionIndex = { version: 1, entries: [] }
      if (current?.text) {
        const parsed = JSON.parse(current.text) as SuggestionIndex
        if (Array.isArray(parsed?.entries)) index = { version: 1, entries: parsed.entries }
      }
      const entry = indexEntry(s)
      const at = index.entries.findIndex((e) => e.id === s.id)
      if (at >= 0) index.entries[at] = entry
      else index.entries.push(entry)
      await writeFile(INDEX, `${JSON.stringify(index, null, 2)}\n`, current?.sha, message)
      return path
    } catch (e) {
      if (attempt >= 1 || !/^(409|422)$/.test((e as Error).message)) throw e
    }
  }
}

/** Stores a suggestion: on the server when there is one, else in the resources repository, else gives its JSON to download. */
export async function saveSuggestion(s: Suggestion): Promise<SaveSuggestionResult> {
  const path = suggestionPath(s)
  const offline = { saved: false as const, path, json: JSON.stringify(s, null, 2) }
  const errors = validateSuggestion(s)
  if (errors.length) return { ...offline, reason: errors.join('; ') }
  let reason: string | undefined
  if (hasServerSession()) {
    try {
      await httpClient('/api/suggestions', { method: 'POST', body: JSON.stringify(s) })
      return { saved: true, where: 'server', path }
    } catch (e) {
      reason = (e as Error).message
    }
  }
  if (canCommit()) {
    try {
      await commitToResources(s, `suggestion: ${s.kind} for ${bookSlug(s.target.book)}`)
      return { saved: true, where: 'resources', path }
    } catch (e) {
      reason = (e as Error).message
    }
  }
  return reason ? { ...offline, reason } : offline
}

function query(filter: SuggestionFilter, offset: number): string {
  const q = new URLSearchParams()
  if (filter.kind) q.set('kind', filter.kind)
  if (filter.book) q.set('book', bookSlug(filter.book))
  if (filter.status) q.set('status', filter.status)
  if (filter.chapter != null) q.set('chapter', String(filter.chapter))
  q.set('offset', String(offset))
  q.set('limit', String(PAGE))
  return q.toString()
}

const matches = (s: Suggestion, f: SuggestionFilter) =>
  (!f.kind || s.kind === f.kind)
  && (!f.book || bookSlug(s.target.book) === bookSlug(f.book))
  && (!f.status || s.status === f.status)
  && (f.chapter == null || s.target.chapter === f.chapter)

async function fromServer(filter: SuggestionFilter): Promise<Suggestion[]> {
  if (!hasServerSession()) return []
  const out: Suggestion[] = []
  try {
    for (let page = 0; page < MAX_PAGES; page++) {
      const r = await httpClient<{ items?: unknown[]; total?: number }>(`/api/suggestions?${query(filter, out.length)}`, { method: 'GET' })
      const items = (r.items ?? []).filter((s) => validateSuggestion(s).length === 0) as Suggestion[]
      out.push(...items)
      if (!r.items?.length || out.length >= (r.total ?? 0)) break
    }
  } catch {
    // no server suggestions: the repository may still have some
  }
  return out
}

async function fromResources(filter: SuggestionFilter): Promise<Suggestion[]> {
  if (!resourcesConfigured()) return []
  try {
    const index = await getJson<SuggestionIndex>(INDEX)
    const slug = filter.book ? bookSlug(filter.book) : null
    const wanted = (index.entries ?? []).filter((e) => INDEX_PATH.test(e.path)
      && (!filter.kind || e.kind === filter.kind)
      && (!slug || e.book === slug)
      && (filter.chapter == null || e.chapter === filter.chapter))
    const files = await Promise.all(wanted.map((e) => getJson<unknown>(`suggestions/${e.path}`).catch(() => null)))
    return files.filter((f) => f !== null && validateSuggestion(f).length === 0 && matches(f as Suggestion, filter)) as Suggestion[]
  } catch {
    return []
  }
}

/** The suggestions of the backend database and of the resources repository, merged by id (the server copy wins). Never throws. */
export async function loadSuggestions(filter: SuggestionFilter): Promise<LoadedSuggestion[]> {
  const [server, resources] = await Promise.all([fromServer(filter), fromResources(filter)])
  const byId = new Map<string, LoadedSuggestion>()
  for (const s of server) byId.set(s.id, { ...s, origin: 'server', origins: ['server'] })
  for (const s of resources) {
    const known = byId.get(s.id)
    if (known) known.origins.push('resources')
    else byId.set(s.id, { ...s, origin: 'resources', origins: ['resources'] })
  }
  return [...byId.values()]
}

export interface UpdateStatusResult {
  ok: boolean
  /** Where the status was changed. */
  updated: SuggestionOrigin[]
  /** When it could not be stored anywhere: the updated JSON to download. */
  json?: string
  reason?: string
}

/** Accepts, rejects or marks applied a suggestion wherever it is kept. */
export async function updateSuggestionStatus(s: LoadedSuggestion, status: SuggestionStatus): Promise<UpdateStatusResult> {
  const updated: SuggestionOrigin[] = []
  const reasons: string[] = []
  const { origin: _origin, origins, ...plain } = s
  void _origin
  const next: Suggestion = { ...plain, status }
  if (origins.includes('server') && hasServerSession()) {
    try {
      await httpClient(`/api/suggestions/${encodeURIComponent(s.id)}`, { method: 'PATCH', body: JSON.stringify({ status }) })
      updated.push('server')
    } catch (e) {
      reasons.push((e as Error).message)
    }
  }
  if (origins.includes('resources') && canCommit()) {
    try {
      const { updatedAt: _u, bookSlug: _b, createdBy: _c, ...file } = next
      void _u; void _b; void _c
      await commitToResources(file, `suggestion: ${status} ${s.id}`)
      updated.push('resources')
    } catch (e) {
      reasons.push((e as Error).message)
    }
  }
  if (updated.length) return { ok: true, updated }
  return { ok: false, updated, json: JSON.stringify(next, null, 2), ...(reasons.length ? { reason: reasons.join('; ') } : {}) }
}

export interface ChapterSuggestions {
  applied: string[]
  stale: string[]
}

/**
 * A chapter's HTML with the accepted (not yet applied) suggestions of its book
 * and chapter written into it. Any failure leaves the HTML as it is.
 */
export async function withChapterSuggestions(html: string, bookTitle: string | null, chapter: number): Promise<{ html: string; suggestions: ChapterSuggestions }> {
  const none = { html, suggestions: { applied: [], stale: [] } }
  if (!bookTitle || !bookSlug(bookTitle)) return none
  try {
    const list = await loadSuggestions({ book: bookTitle, status: 'accepted', chapter })
    if (!list.length) return none
    const out = applySuggestionsToHtml(html, list)
    return { html: out.html, suggestions: { applied: out.applied, stale: out.stale } }
  } catch {
    return none
  }
}
