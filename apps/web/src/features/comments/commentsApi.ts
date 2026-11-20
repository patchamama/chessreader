import { hasServerSession } from '../../shared/api/serverSession'
import { httpClient } from '../../shared/api/httpClient'
import { getJson } from '../library/commentdb/commentLookup'

/**
 * Every comment of the commentary database (S2): from the server's
 * comments.sqlite, or, without a server, from the comments-index/ pages that
 * scripts/build-comment-db.mjs writes into the resources.
 */

export interface CommentSource { id: number; title: string; author: string | null; kind: string; lang: string; book: string | null; comments?: number }

export interface CommentEntry {
  id: number
  hash: string
  /** The position after the move (full FEN). */
  fen: string
  text: string
  lang: string
  ply: number
  /** Full move number. */
  move: number
  san: string
  gameId: string
  /** The book chapter it was read from (chapters with text, from 1); null when unknown. */
  chapter: number | null
  source: CommentSource
  game: { white: string | null; black: string | null; label: string | null }
  /** The comment in other languages by language (the universal text is under the comment's own language); undefined when the list cannot tell. */
  translations?: Record<string, string>
}

export interface CommentFilter { q?: string; source?: number; lang?: string; kind?: string }
export interface CommentPage { total: number; comments: CommentEntry[] }

interface IndexEntry { id: number; hash: string; fen: string; text: string; lang: string; ply: number; move: number; san: string; game: string; source: number; label: string | null; white: string | null; black: string | null; chapter: number | null; translations?: Record<string, string> }
interface IndexMeta { total: number; pages: number; pageSize: number; sources: Record<string, Omit<CommentSource, 'id'> & { priority?: number }> }
interface ServerComment { id: number; hash: string; fen: string; text: string; lang: string; ply: number; move_number: number; san: string; game_id: string; chapter: number | null; translations?: Record<string, string>; source: CommentSource; game: CommentEntry['game'] }

/** "12...Nb6" or "8. Nc3": white moves are on odd plies. */
export const moveLabel = (c: Pick<CommentEntry, 'ply' | 'move' | 'san'>) => `${c.move}${c.ply % 2 === 1 ? '. ' : '...'}${c.san}`

let meta: Promise<IndexMeta> | null = null
const pages = new Map<number, Promise<IndexEntry[]>>()

/** Test hook: forget the pages read. */
export function clearCommentListCache() {
  meta = null
  pages.clear()
}

function loadMeta(): Promise<IndexMeta> {
  meta ??= getJson<IndexMeta>('comments-index/meta.json')
  meta.catch(() => { meta = null })
  return meta
}

function loadPage(n: number): Promise<IndexEntry[]> {
  let page = pages.get(n)
  if (!page) {
    page = getJson<{ comments: IndexEntry[] }>(`comments-index/${n}.json`).then((p) => p.comments ?? [])
    pages.set(n, page)
    page.catch(() => pages.delete(n))
  }
  return page
}

const sourceOf = (m: IndexMeta, id: number): CommentSource => {
  const s = m.sources[String(id)]
  return { id, title: s?.title ?? '?', author: s?.author ?? null, kind: s?.kind ?? 'book', lang: s?.lang ?? '', book: s?.book ?? null }
}

const fromIndex = (m: IndexMeta, e: IndexEntry): CommentEntry => ({
  id: e.id, hash: e.hash, fen: e.fen, text: e.text, lang: e.lang, ply: e.ply, move: e.move, san: e.san, gameId: e.game, chapter: e.chapter ?? null,
  source: sourceOf(m, e.source), game: { white: e.white ?? null, black: e.black ?? null, label: e.label ?? null },
  ...(e.translations ? { translations: e.translations } : {}),
})

const fromServer = (c: ServerComment): CommentEntry => ({
  id: c.id, hash: c.hash, fen: c.fen, text: c.text, lang: c.lang, ply: c.ply, move: c.move_number, san: c.san, gameId: c.game_id, chapter: c.chapter ?? null,
  source: c.source, game: c.game, ...(c.translations ? { translations: c.translations } : {}),
})

const filtered = (f: CommentFilter) => !!(f.q?.trim() || f.source || f.lang || f.kind)

function matches(m: IndexMeta, e: IndexEntry, f: CommentFilter): boolean {
  const q = f.q?.trim().toLocaleLowerCase()
  return (!q || e.text.toLocaleLowerCase().includes(q))
    && (!f.source || e.source === f.source)
    && (!f.lang || e.lang === f.lang)
    && (!f.kind || m.sources[String(e.source)]?.kind === f.kind)
}

/** A page of comments (`offset`, `limit` ≤ 200) and how many match the filter. */
export async function loadCommentPage(filter: CommentFilter, offset: number, limit: number): Promise<CommentPage> {
  if (hasServerSession()) {
    const q = new URLSearchParams({ offset: String(offset), limit: String(limit) })
    if (filter.q?.trim()) q.set('q', filter.q.trim())
    if (filter.source) q.set('source', String(filter.source))
    if (filter.lang) q.set('lang', filter.lang)
    if (filter.kind) q.set('kind', filter.kind)
    const r = await httpClient<{ total: number; comments: ServerComment[] }>(`/api/comments?${q}`, { method: 'GET' })
    return { total: r.total, comments: r.comments.map(fromServer) }
  }
  const m = await loadMeta()
  if (!filtered(filter)) {
    // Only the pages shown are read.
    const first = Math.floor(offset / m.pageSize)
    const last = Math.min(m.pages - 1, Math.floor((offset + limit - 1) / m.pageSize))
    const read = await Promise.all(Array.from({ length: Math.max(0, last - first + 1) }, (_, i) => loadPage(first + i)))
    const start = offset - first * m.pageSize
    return { total: m.total, comments: read.flat().slice(start, start + limit).map((e) => fromIndex(m, e)) }
  }
  const all = (await Promise.all(Array.from({ length: m.pages }, (_, i) => loadPage(i)))).flat().filter((e) => matches(m, e, filter))
  return { total: all.length, comments: all.slice(offset, offset + limit).map((e) => fromIndex(m, e)) }
}

/** The books and studies the comments come from. */
export async function loadCommentSources(): Promise<CommentSource[]> {
  if (hasServerSession()) return (await httpClient<{ sources: CommentSource[] }>('/api/comments/sources', { method: 'GET' })).sources
  const m = await loadMeta()
  return Object.keys(m.sources).map(Number).sort((a, b) => a - b).map((id) => ({ ...sourceOf(m, id), ...(m.sources[String(id)].comments !== undefined ? { comments: m.sources[String(id)].comments } : {}) }))
}

export interface CommentGame { id: string; white: string | null; black: string | null; pgn: string }

/** The whole game (PGN) a comment comes from. */
export async function loadCommentGame(id: string): Promise<CommentGame> {
  const g = hasServerSession()
    ? await httpClient<CommentGame>(`/api/comments/games/${encodeURIComponent(id)}`, { method: 'GET' })
    : await getJson<CommentGame>(`g/${encodeURIComponent(id)}.json`)
  return { id: g.id, white: g.white ?? null, black: g.black ?? null, pgn: g.pgn }
}
