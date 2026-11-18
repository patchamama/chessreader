import { httpClient } from '../../shared/api/httpClient'
import { isDemoHost } from '../../shared/env/devMode'
import { useAuthStore } from '../auth/store/authStore'
import { getJson, resourcesConfigured } from '../library/commentdb/commentLookup'

/** A book of the private resources: cover, games, most frequent players, period of most games. */
export interface DbBook {
  id: string; title: string; author: string | null; lang: string; cover: string | null; thumb: string | null
  games: number; topPlayers: { name: string; games: number }[]; period: [number, number] | null
}
export interface DbGame { id: string; book: string; white: string | null; black: string | null; year: number | null; opening: string; result: string; moves: number; first: string }
export interface DbGameFull extends Omit<DbGame, 'book' | 'first'> { event: string | null; first: string; pgn: string }
export interface PlayerRating {
  player: string; names: string[]; games: number; accuracy: number; engineAgreement: number; maiaAgreement: number | null
  nearPerfect: { game: string; accuracy: number; color: string; white: string; black: string; year: number | null; book: string }[]
}

/** Whether the private resources can be read: a server session, or the resources repository set in Settings. */
export function hasResources(): boolean {
  return (!isDemoHost() && !!useAuthStore.getState().token) || resourcesConfigured()
}

/** A JSON file of the resources: from the server (storage/resources) or the private repository. */
export async function resource<T>(name: string): Promise<T> {
  if (!isDemoHost() && useAuthStore.getState().token) {
    try { return await httpClient<T>(`/api/resources/${name.replace(/\.json$/, '').replace(/\//g, '-')}`, { method: 'GET' }) } catch { /* try the repository */ }
  }
  return getJson<T>(name)
}

export const loadBooks = () => resource<DbBook[]>('books.json')
export async function loadGames(): Promise<DbGame[]> {
  const data = await resource<{ fields: string[]; games: unknown[][] }>('games.json')
  return data.games.map((g) => Object.fromEntries(data.fields.map((f, i) => [f === 'book' ? 'book' : f, g[i]])) as unknown as DbGame)
}
export const loadBookGames = (bookId: string) => resource<DbGameFull[]>(`games/${bookId}.json`)
export const loadRatings = () => resource<{ engine: string; maia: string | null; players: PlayerRating[] }>('ratings.json')

/** Surname: the books name the same player in several ways. */
export const surname = (name: string) => name.trim().split(/\s+/).pop() ?? name

// ── statistics ──────────────────────────────────────────────────────────────

/** Games per decade, oldest first. */
export function gamesPerDecade(games: DbGame[]): { label: string; value: number }[] {
  const by = new Map<number, number>()
  for (const g of games) if (g.year) by.set(Math.floor(g.year / 10) * 10, (by.get(Math.floor(g.year / 10) * 10) ?? 0) + 1)
  return [...by.entries()].sort((a, b) => a[0] - b[0]).map(([d, value]) => ({ label: `${d}s`, value }))
}

/** Players with most games, with their games as White and as Black and their score. */
export function topPlayers(games: DbGame[], n: number): { name: string; games: number; white: number; black: number; score: number }[] {
  const by = new Map<string, { games: number; white: number; black: number; points: number; decided: number }>()
  const add = (name: string | null, side: 'white' | 'black', g: DbGame) => {
    if (!name) return
    const k = surname(name)
    const p = by.get(k) ?? by.set(k, { games: 0, white: 0, black: 0, points: 0, decided: 0 }).get(k)!
    p.games++; p[side]++
    if (g.result !== '*') { p.decided++; p.points += g.result === '½-½' ? 0.5 : (g.result === '1-0') === (side === 'white') ? 1 : 0 }
  }
  for (const g of games) { add(g.white, 'white', g); add(g.black, 'black', g) }
  return [...by.entries()].map(([name, p]) => ({ name, games: p.games, white: p.white, black: p.black, score: p.decided ? Math.round((p.points / p.decided) * 100) : -1 }))
    .sort((a, b) => b.games - a.games).slice(0, n)
}

/** First moves: how often each is played and how White scored with it (decided results only). */
export function firstMoves(games: DbGame[]): { move: string; games: number; whiteScore: number }[] {
  const by = new Map<string, { games: number; points: number; decided: number }>()
  for (const g of games) {
    if (!g.first) continue
    const p = by.get(g.first) ?? by.set(g.first, { games: 0, points: 0, decided: 0 }).get(g.first)!
    p.games++
    if (g.result !== '*') { p.decided++; p.points += g.result === '1-0' ? 1 : g.result === '½-½' ? 0.5 : 0 }
  }
  return [...by.entries()].map(([move, p]) => ({ move, games: p.games, whiteScore: p.decided ? Math.round((p.points / p.decided) * 100) : -1 })).sort((a, b) => b.games - a.games)
}

/** Openings with their number of games. */
export function openings(games: DbGame[]): { name: string; games: number }[] {
  const by = new Map<string, number>()
  for (const g of games) { const k = g.opening || 'Unknown'; by.set(k, (by.get(k) ?? 0) + 1) }
  return [...by.entries()].map(([name, n]) => ({ name, games: n })).sort((a, b) => b.games - a.games)
}

/** A short description of a player from Wikipedia (fetched at view time, not stored). */
export async function wikipediaSummary(name: string, lang: string): Promise<{ extract: string; url: string; thumbnail?: string } | null> {
  for (const l of [lang, 'en']) {
    try {
      const res = await fetch(`https://${l}.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(name.replace(/\s+/g, '_'))}`)
      if (!res.ok) continue
      const d = (await res.json()) as { extract?: string; content_urls?: { desktop?: { page?: string } }; thumbnail?: { source: string }; type?: string }
      if (d.type === 'disambiguation' || !d.extract) continue
      return { extract: d.extract, url: d.content_urls?.desktop?.page ?? '', ...(d.thumbnail ? { thumbnail: d.thumbnail.source } : {}) }
    } catch { /* next language */ }
  }
  return null
}
