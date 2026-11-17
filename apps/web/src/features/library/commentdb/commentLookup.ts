import { positionHash, type Lang } from '@chess-ebook/chess-shared'
import { httpClient } from '../../../shared/api/httpClient'
import { isDemoHost } from '../../../shared/env/devMode'
import { useSettingsStore } from '../../../shared/settings/settingsStore'
import { useAuthStore } from '../../auth/store/authStore'

/** What an author said about a position, and where it comes from. */
export interface HumanComment {
  text: string
  lang: string
  ply: number
  san: string
  gameId: string
  label: string | null
  source: { kind: string; title: string; author: string | null }
}

interface ShardEntry { id: number; text: string; lang: string; game: string; ply: number; san: string; source: number; label: string | null }
interface Index { sources: Record<string, { kind: string; title: string; author: string | null; priority: number }> }

const shards = new Map<string, Promise<Record<string, ShardEntry[]>>>()
let index: Promise<Index> | null = null

/** Test hook: forget what was read. */
export function clearCommentCache() {
  shards.clear()
  index = null
}

/** A file of the static database: public URL, or the GitHub contents API of a private repository with a token. */
function getJson<T>(path: string): Promise<T> {
  const { commentDbUrl, commentDbToken } = useSettingsStore.getState()
  const url = `${commentDbUrl.replace(/\/+$/, '')}/${path}`
  const headers: Record<string, string> = {}
  if (/^https:\/\/api\.github\.com\//.test(url)) headers.Accept = 'application/vnd.github.raw+json'
  if (commentDbToken) headers.Authorization = `Bearer ${commentDbToken}`
  return fetch(url, Object.keys(headers).length ? { headers } : undefined).then((r) => (r.ok ? (r.json() as Promise<T>) : Promise.reject(new Error(String(r.status)))))
}

/**
 * The comments of a position: from the server's database when there is a
 * server and a session, else from the static database set in Settings (sharded
 * JSON by position hash). Books come before Lichess studies.
 */
export async function lookupPositionComments(fen: string): Promise<HumanComment[]> {
  const hash = positionHash(fen)
  if (!isDemoHost() && useAuthStore.getState().token) {
    try {
      const r = await httpClient<{ comments: Array<Omit<HumanComment, 'gameId' | 'label'> & { game: { id: string; label: string | null } }> }>(
        `/api/comments/position?hash=${hash}&fen=${encodeURIComponent(fen)}`, { method: 'GET' })
      if (r.comments.length) return r.comments.map(({ game, ...c }) => ({ ...c, gameId: game.id, label: game.label }))
    } catch {
      // no database on the server: try the static one
    }
  }
  if (!useSettingsStore.getState().commentDbUrl) return []
  try {
    index ??= getJson<Index>('index.json')
    const prefix = hash.slice(0, 2)
    if (!shards.has(prefix)) shards.set(prefix, getJson<Record<string, ShardEntry[]>>(`p/${prefix}.json`))
    const [idx, shard] = await Promise.all([index, shards.get(prefix)!])
    return (shard[hash] ?? [])
      .map((e) => ({ e, s: idx.sources[String(e.source)] }))
      .filter(({ s }) => s)
      .sort((a, b) => a.s.priority - b.s.priority || a.e.id - b.e.id)
      .map(({ e, s }) => ({ text: e.text, lang: e.lang, ply: e.ply, san: e.san, gameId: e.game, label: e.label, source: { kind: s.kind, title: s.title, author: s.author } }))
  } catch {
    index = null
    return []
  }
}

/** Whether any commentary database can be asked (a server session, or a static database in Settings). */
export function hasCommentSource(): boolean {
  return (!isDemoHost() && !!useAuthStore.getState().token) || !!useSettingsStore.getState().commentDbUrl
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
    const best = found.find((c) => c.lang === lang) ?? found[0]
    out[i + 1] = { text: best.text, source: commentSource(best) }
  }
  return out
}
