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
  /** When the comment was hidden (server only); null or undefined when visible. */
  hiddenAt?: string | null
}

export interface CommentFilter { q?: string; source?: number; lang?: string; kind?: string; /** true: only the hidden comments (to restore them); default only the visible ones. Server only. */ hidden?: boolean }
export interface CommentPage { total: number; comments: CommentEntry[] }

interface IndexEntry { id: number; hash: string; fen: string; text: string; lang: string; ply: number; move: number; san: string; game: string; source: number; label: string | null; white: string | null; black: string | null; chapter: number | null; translations?: Record<string, string> }
interface IndexMeta { total: number; pages: number; pageSize: number; sources: Record<string, Omit<CommentSource, 'id'> & { priority?: number }> }
interface ServerComment { id: number; hash: string; fen: string; text: string; lang: string; ply: number; move_number: number; san: string; game_id: string; chapter: number | null; translations?: Record<string, string>; hidden_at?: string | null; source: CommentSource; game: CommentEntry['game'] }

/** "12...Nb6" or "8. Nc3": white moves are on odd plies. */
export const moveLabel = (c: Pick<CommentEntry, 'ply' | 'move' | 'san'>) => `${c.move}${c.ply % 2 === 1 ? '. ' : '...'}${c.san}`

let meta: Promise<IndexMeta> | null = null
const pages = new Map<number, Promise<IndexEntry[]>>()
const tops = new Map<string, Promise<TopPosition[]>>()

/** Test hook: forget the pages read. */
export function clearCommentListCache() {
  meta = null
  pages.clear()
  tops.clear()
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
  ...(c.hidden_at !== undefined ? { hiddenAt: c.hidden_at } : {}),
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
    if (filter.hidden) q.set('hidden', '1')
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

export interface CommentGame { id: string; white: string | null; black: string | null; pgn: string; /** The PGN in other languages (language → PGN), when the database keeps them. */ translations?: Record<string, string> }

/** The whole game (PGN) a comment comes from. */
export async function loadCommentGame(id: string): Promise<CommentGame> {
  const g = hasServerSession()
    ? await httpClient<CommentGame>(`/api/comments/games/${encodeURIComponent(id)}`, { method: 'GET' })
    : await getJson<CommentGame>(`g/${encodeURIComponent(id)}.json`)
  return { id: g.id, white: g.white ?? null, black: g.black ?? null, pgn: g.pgn, ...(g.translations && Object.keys(g.translations).length ? { translations: g.translations } : {}) }
}

/** Hides a comment: it stays in the server's database but is no longer listed or shown (admin). */
export async function hideComment(id: number): Promise<void> {
  await httpClient<{ hidden: number }>(`/api/comments/${id}`, { method: 'DELETE' })
  clearCommentListCache()
}

/** Shows a hidden comment again (admin). */
export async function restoreComment(id: number): Promise<void> {
  await httpClient<{ restored: number }>(`/api/comments/${id}/restore`, { method: 'POST' })
  clearCommentListCache()
}

/** Saves the universal text (lang = the comment's own) or a translation of a comment into the server's database (admin). */
export async function setCommentTranslation(id: number, lang: string, text: string): Promise<void> {
  await httpClient<{ saved: number }>(`/api/comments/${id}/translations/${lang}`, { method: 'PUT', body: JSON.stringify({ text }) })
  clearCommentListCache()
}

/** @deprecated Comments are hidden, not deleted: use hideComment. */
export const deleteComment = hideComment

export interface TopPositionSource { id: number; title: string; author: string | null; book: string | null; kind: string; lang: string; count: number }
/** `text` is cut to 240 characters. */
export interface TopPositionSample { id: number; ply: number; move: number; san: string; text: string }
export interface TopPosition { rank: number; fen: string; count: number; sources: TopPositionSource[]; samples: TopPositionSample[] }

const MAX_TOP = 100
const MAX_SOURCES = 6
const MAX_SAMPLES = 3

/**
 * The positions with most comments (a position = hash + FEN without move counters, as the server
 * groups them), count desc then hash. `q`, `source`, `lang` and `kind` of the filter are honoured;
 * hidden comments are never counted. Without a server it is computed from the comments-index pages
 * (aggregated once per filter and kept for the session).
 */
export async function loadTopPositions(filter: CommentFilter = {}, limit = 50): Promise<TopPosition[]> {
  const n = Math.max(1, Math.min(MAX_TOP, limit))
  if (hasServerSession()) {
    const q = new URLSearchParams({ limit: String(n) })
    if (filter.q?.trim()) q.set('q', filter.q.trim())
    if (filter.source) q.set('source', String(filter.source))
    if (filter.lang) q.set('lang', filter.lang)
    if (filter.kind) q.set('kind', filter.kind)
    return (await httpClient<{ positions: TopPosition[] }>(`/api/comments/top?${q}`, { method: 'GET' })).positions
  }
  const f: CommentFilter = { q: filter.q, source: filter.source, lang: filter.lang, kind: filter.kind }
  const key = JSON.stringify([f.q?.trim() ?? '', f.source ?? 0, f.lang ?? '', f.kind ?? ''])
  let ranking = tops.get(key)
  if (!ranking) {
    ranking = aggregateTop(f)
    tops.set(key, ranking)
    ranking.catch(() => tops.delete(key))
  }
  return (await ranking).slice(0, n)
}

async function aggregateTop(filter: CommentFilter): Promise<TopPosition[]> {
  const m = await loadMeta()
  const all = (await Promise.all(Array.from({ length: m.pages }, (_, i) => loadPage(i)))).flat()
  const groups = new Map<string, { hash: string; fen: string; entries: IndexEntry[] }>()
  for (const e of all) {
    if (!matches(m, e, filter)) continue
    const fen = e.fen.split(/\s+/).slice(0, 4).join(' ')
    const k = `${e.hash}\u0000${fen}`
    const g = groups.get(k) ?? groups.set(k, { hash: e.hash, fen: `${fen} 0 1`, entries: [] }).get(k)!
    g.entries.push(e)
  }
  const priority = (id: number) => m.sources[String(id)]?.priority ?? id
  return [...groups.values()]
    .sort((a, b) => b.entries.length - a.entries.length || (a.hash < b.hash ? -1 : a.hash > b.hash ? 1 : 0) || (a.fen < b.fen ? -1 : 1))
    .slice(0, MAX_TOP)
    .map((g, i) => {
      const bySource = new Map<number, number>()
      for (const e of g.entries) bySource.set(e.source, (bySource.get(e.source) ?? 0) + 1)
      const sources = [...bySource].sort((a, b) => b[1] - a[1] || priority(a[0]) - priority(b[0]) || a[0] - b[0]).slice(0, MAX_SOURCES)
        .map(([id, count]) => { const s = sourceOf(m, id); return { id, title: s.title, author: s.author, book: s.book, kind: s.kind, lang: s.lang, count } })
      const samples = [...g.entries].sort((a, b) => priority(a.source) - priority(b.source) || a.id - b.id).slice(0, MAX_SAMPLES)
        .map((e) => ({ id: e.id, ply: e.ply, move: e.move, san: e.san, text: e.text.slice(0, 240) }))
      return { rank: i + 1, fen: g.fen, count: g.entries.length, sources, samples }
    })
}

export interface BookGamePayload {
  book: { title: string; author?: string | null; lang: string }
  chapter: number
  game: {
    label?: string | null
    white?: string | null
    black?: string | null
    pgn: string
    comments: { hash: string; key: string; ply: number; move: number; san: string; text: string }[]
    /** Per language: the game's PGN and the comments (same order as `comments`). */
    translations?: Record<string, { pgn?: string; comments: string[] }>
  }
}

/**
 * Keeps a book's game in the server's commentary database with its comments in
 * the book's language and their translations; the game record also holds the
 * PGN in each language (admin). Saving the same game again adds nothing twice.
 */
export async function saveBookGame(payload: BookGamePayload): Promise<{ gameId: string; sourceId: number; added: number; translated: number }> {
  const result = await httpClient<{ gameId: string; sourceId: number; added: number; translated: number }>('/api/comments/book-games', { method: 'POST', body: JSON.stringify(payload) })
  clearCommentListCache()
  return result
}
