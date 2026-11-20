import { positionHash, type Lang } from '@chess-ebook/chess-shared'
import { hasServerSession } from '../../../shared/api/serverSession'
import { httpClient } from '../../../shared/api/httpClient'
import { useSettingsStore } from '../../../shared/settings/settingsStore'

/** What an author said about a position, and where it comes from. */
export interface HumanComment {
  text: string
  lang: string
  ply: number
  san: string
  gameId: string
  label: string | null
  source: { kind: string; title: string; author: string | null }
  /** The comment in other languages (AI translations accepted into the database). */
  translations?: Record<string, string>
}

interface ShardEntry { id: number; text: string; lang: string; game: string; ply: number; san: string; source: number; label: string | null; translations?: Record<string, string> }
interface Index { sources: Record<string, { kind: string; title: string; author: string | null; priority: number }> }

const shards = new Map<string, Promise<Record<string, ShardEntry[]>>>()
let index: Promise<Index> | null = null

/** Test hook: forget what was read. */
export function clearCommentCache() {
  shards.clear()
  index = null
}

/** A file of the static database: public URL, or the GitHub contents API of a private repository with a token. */
export function getJson<T>(path: string): Promise<T> {
  return getResource(path).then((r) => r.json() as Promise<T>)
}

/** A text file of the static database (a book text), read like getJson. */
export function getText(path: string): Promise<string> {
  return getResource(path).then((r) => r.text())
}

/**
 * The base URL to read files from: a github.com repository URL (what people
 * copy from the browser) becomes its contents API URL — github.com itself does
 * not allow reading from another site.
 */
export function resourcesApiUrl(url: string): string {
  const u = url.trim().replace(/\/+$/, '')
  const gh = /^https:\/\/(?:www\.)?github\.com\/([\w.-]+)\/([\w.-]+?)(?:\.git)?(?:\/.*)?$/.exec(u)
  return gh ? `https://api.github.com/repos/${gh[1]}/${gh[2]}/contents` : u
}

/**
 * GitHub's page to create a fine-grained token, prefilled for the repository's
 * owner with read-only contents (the repository itself is chosen there under
 * "Only select repositories"). Null when the URL is not a GitHub repository.
 */
export function resourcesTokenUrl(url: string): string | null {
  const m = /^https:\/\/api\.github\.com\/repos\/([\w.-]+)\/([\w.-]+)\/contents$/.exec(resourcesApiUrl(url))
  if (!m) return null
  const q = new URLSearchParams({
    name: `ChessReader ${m[2]}`, description: `Read ${m[2]} from ChessReader`, target_name: m[1], expires_in: '365', contents: 'read',
  })
  return `https://github.com/settings/personal-access-tokens/new?${q}`
}

/** What a deploy reads when Settings names no resources repository: the public sample (no token). */
export const DEFAULT_RESOURCES_URL = 'https://raw.githubusercontent.com/patchamama/chessreader-resources-sample/main'

/** The repository to read and its token: the one of Settings, else the public sample without any token. */
function resourcesSource(): { url: string; token: string } {
  const { commentDbUrl, commentDbToken } = useSettingsStore.getState()
  return commentDbUrl.trim() ? { url: commentDbUrl, token: commentDbToken } : { url: DEFAULT_RESOURCES_URL, token: '' }
}

/** Whether the static database can be read: a URL, and a token when it is on GitHub (the repository is private). */
export function resourcesConfigured(): boolean {
  const { url: commentDbUrl, token: commentDbToken } = resourcesSource()
  return !/^https:\/\/(?:api\.|www\.)?github\.com\//.test(resourcesApiUrl(commentDbUrl)) || !!commentDbToken
}

/** Try the URL and token of Settings: the books of the repository, or why it cannot be read. */
export async function checkResources(): Promise<{ ok: boolean; message: string }> {
  try {
    const books = await getJson<unknown[]>('books/manifest.json')
    return { ok: true, message: `✓ ${Array.isArray(books) ? books.length : 0} books` }
  } catch (e) {
    const m = (e as Error).message
    if (m === '401' || m === '403') return { ok: false, message: `The token was rejected (${m}): check it or create a new one.` }
    if (m === '404') return { ok: false, message: 'Repository not found (404): check the URL, and that the token can read this repository.' }
    return { ok: false, message: `Could not reach the repository: ${m}` }
  }
}

function getResource(path: string): Promise<Response> {
  const { url: commentDbUrl, token: commentDbToken } = resourcesSource()
  const url = `${resourcesApiUrl(commentDbUrl)}/${path}`
  const headers: Record<string, string> = {}
  let host = ''
  try { const u = new URL(url); host = u.protocol === 'https:' ? u.hostname : '' } catch { /* not a URL */ }
  if (host === 'api.github.com') headers.Accept = 'application/vnd.github.raw+json'
  // The token is for GitHub: it never goes to any other host.
  if (commentDbToken && (host === 'api.github.com' || host === 'raw.githubusercontent.com')) headers.Authorization = `Bearer ${commentDbToken}`
  return fetch(url, Object.keys(headers).length ? { headers } : undefined).then((r) => (r.ok ? r : Promise.reject(new Error(String(r.status)))))
}

/**
 * The comments of a position: from the server's database when there is a
 * server and a session, else from the static database set in Settings (sharded
 * JSON by position hash). Books come before Lichess studies.
 */
export async function lookupPositionComments(fen: string): Promise<HumanComment[]> {
  const hash = positionHash(fen)
  if (hasServerSession()) {
    try {
      const r = await httpClient<{ comments: Array<Omit<HumanComment, 'gameId' | 'label'> & { game: { id: string; label: string | null } }> }>(
        `/api/comments/position?hash=${hash}&fen=${encodeURIComponent(fen)}`, { method: 'GET' })
      if (r.comments.length) return r.comments.map(({ game, ...c }) => ({ ...c, gameId: game.id, label: game.label }))
    } catch {
      // no database on the server: try the static one
    }
  }
  if (!resourcesConfigured()) return []
  try {
    index ??= getJson<Index>('index.json')
    const prefix = hash.slice(0, 2)
    if (!shards.has(prefix)) shards.set(prefix, getJson<Record<string, ShardEntry[]>>(`p/${prefix}.json`))
    const [idx, shard] = await Promise.all([index, shards.get(prefix)!])
    return (shard[hash] ?? [])
      .map((e) => ({ e, s: idx.sources[String(e.source)] }))
      .filter(({ s }) => s)
      .sort((a, b) => a.s.priority - b.s.priority || a.e.id - b.e.id)
      .map(({ e, s }) => ({
        text: e.text, lang: e.lang, ply: e.ply, san: e.san, gameId: e.game, label: e.label,
        source: { kind: s.kind, title: s.title, author: s.author },
        ...(e.translations ? { translations: e.translations } : {}),
      }))
  } catch {
    index = null
    return []
  }
}

/** Whether any commentary database can be asked (a server session, or a static database in Settings). */
export function hasCommentSource(): boolean {
  return hasServerSession() || resourcesConfigured()
}

/** "Kasparov, Mis geniales predecesores III, Partida 7": quiet, but says where it comes from. */
export function commentSource(c: HumanComment): string {
  const author = c.source.author?.split(/\s+/).pop()
  return [author, c.source.title, c.label].filter(Boolean).join(', ')
}

/** Positions of the opening are commented everywhere with generic words: borrowing starts after them. */
const FIRST_PLY = 9

/**
 * For each position of a reviewed game that an author commented (after the
 * opening), the best remark: in the reader's language first, books before
 * studies. Keyed by ply (1-based), ready for annotateGame's `human` option.
 */
export async function humanCommentsForGame(plies: Array<{ fenAfter: string }>, lang: Lang, max = 15): Promise<Record<number, { text: string; source: string }>> {
  const out: Record<number, { text: string; source: string }> = {}
  for (let i = FIRST_PLY; i < plies.length && Object.keys(out).length < max; i++) {
    const found = await lookupPositionComments(plies[i].fenAfter)
    if (!found.length) continue
    // Written in the reader's language, or translated into it, before any other.
    const best = found.find((c) => c.lang === lang) ?? found.find((c) => c.translations?.[lang]) ?? found[0]
    const text = best.lang === lang ? best.text : best.translations?.[lang] ?? best.text
    out[i + 1] = { text, source: commentSource(best) }
  }
  return out
}
