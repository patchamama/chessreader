/**
 * Public game sources, queried straight from the browser (all send CORS
 * headers). Since 2025 the Lichess opening explorer (masters database) answers
 * 401 without a personal token: the user creates one on lichess.org (no scope
 * needed) and it is sent as `Authorization: Bearer`.
 *
 * What each site really offers (checked against the live APIs):
 *  - Lichess has no API to search studies by topic. It does list the studies of
 *    an author and exports a study as PGN with its annotations.
 *  - Lichess' masters explorer returns the top master games of an opening.
 *  - Lichess can search broadcasts (tournaments) by name.
 *  - chess.com has no search for annotated games. Its public API only lists a
 *    player's games by month (plain PGN, no comments).
 */

/** Where a Lichess user creates a personal token (no scope is needed to read). */
export const LICHESS_TOKEN_URL = 'https://lichess.org/account/oauth/token/create?description=Chess%20reader'

/** Lichess refused the request: it needs a personal token, or the one given is wrong. */
export class LichessAuthError extends Error {
  constructor(hadToken: boolean) {
    super(hadToken
      ? 'Lichess rejected the personal token (401). Create a new one and paste it here.'
      : 'Lichess now asks for a personal token to use its masters database (401). Create one (free, no permission needed) and paste it here.')
    this.name = 'LichessAuthError'
  }
}

async function get(url: string, accept?: string, token?: string): Promise<Response> {
  const headers: Record<string, string> = {}
  if (accept) headers.Accept = accept
  if (token) headers.Authorization = `Bearer ${token}`
  const res = await fetch(url, Object.keys(headers).length ? { headers } : undefined)
  if (res.status === 401) throw new LichessAuthError(!!token)
  if (!res.ok) throw new Error(`${new URL(url).hostname} answered ${res.status}`)
  return res
}

// Offline copy: every PGN read from Lichess is kept in this browser, so a game
// already opened still opens when Lichess cannot be reached.
const CACHE_KEY = 'chessreader.lichess-cache.v1'
const CACHE_MAX = 40
export interface CachedEntry { key: string; title: string; pgn: string; savedAt: number }

export function cachedLichessEntries(): CachedEntry[] {
  try {
    const raw = localStorage.getItem(CACHE_KEY)
    return raw ? (JSON.parse(raw) as CachedEntry[]) : []
  } catch {
    return []
  }
}

function remember(key: string, pgn: string) {
  try {
    const title = /\[(?:StudyName|Event) "([^"]*)"\]/.exec(pgn)?.[1] ?? key
    const rest = cachedLichessEntries().filter((e) => e.key !== key)
    localStorage.setItem(CACHE_KEY, JSON.stringify([{ key, title, pgn, savedAt: Date.now() }, ...rest].slice(0, CACHE_MAX)))
  } catch {
    // storage full or blocked: the copy is a convenience
  }
}

/** Read a PGN, keep a copy, and fall back to that copy when the network fails (not on a refusal). */
async function cachedPgn(key: string, load: () => Promise<Response>): Promise<string> {
  try {
    const pgn = await (await load()).text()
    remember(key, pgn)
    return pgn
  } catch (e) {
    const copy = cachedLichessEntries().find((x) => x.key === key)
    if (copy && !(e instanceof LichessAuthError)) return copy.pgn
    throw e
  }
}

export interface StudySummary {
  id: string
  name: string
  updatedAt: number
}

export async function lichessStudiesBy(author: string): Promise<StudySummary[]> {
  const user = encodeURIComponent(author.trim().toLowerCase())
  const text = await (await get(`https://lichess.org/api/study/by/${user}`, 'application/x-ndjson')).text()
  return text
    .split('\n')
    .filter((l) => l.trim())
    .map((l) => JSON.parse(l) as StudySummary)
    .map(({ id, name, updatedAt }) => ({ id, name, updatedAt }))
}

export async function lichessStudyPgn(id: string): Promise<string> {
  return cachedPgn(`study:${id}`, () => get(`https://lichess.org/api/study/${encodeURIComponent(id)}.pgn?clocks=false`))
}

export interface Opening {
  id: string
  name: string
  /** Moves from the initial position, in UCI. */
  moves: string[]
}

export const OPENINGS: Opening[] = [
  { id: 'italian', name: 'Italian Game', moves: ['e2e4', 'e7e5', 'g1f3', 'b8c6', 'f1c4'] },
  { id: 'ruy-lopez', name: 'Ruy Lopez (Spanish)', moves: ['e2e4', 'e7e5', 'g1f3', 'b8c6', 'f1b5'] },
  { id: 'kings-gambit', name: "King's Gambit", moves: ['e2e4', 'e7e5', 'f2f4'] },
  { id: 'sicilian', name: 'Sicilian Defence', moves: ['e2e4', 'c7c5'] },
  { id: 'najdorf', name: 'Sicilian Najdorf', moves: ['e2e4', 'c7c5', 'g1f3', 'd7d6', 'd2d4', 'c5d4', 'f3d4', 'g8f6', 'b1c3', 'a7a6'] },
  { id: 'french', name: 'French Defence', moves: ['e2e4', 'e7e6'] },
  { id: 'caro-kann', name: 'Caro-Kann Defence', moves: ['e2e4', 'c7c6'] },
  { id: 'queens-gambit', name: "Queen's Gambit", moves: ['d2d4', 'd7d5', 'c2c4'] },
  { id: 'nimzo-indian', name: 'Nimzo-Indian Defence', moves: ['d2d4', 'g8f6', 'c2c4', 'e7e6', 'b1c3', 'f8b4'] },
  { id: 'kings-indian', name: "King's Indian Defence", moves: ['d2d4', 'g8f6', 'c2c4', 'g7g6', 'b1c3', 'f8g7'] },
  { id: 'grunfeld', name: 'Grünfeld Defence', moves: ['d2d4', 'g8f6', 'c2c4', 'g7g6', 'b1c3', 'd7d5'] },
  { id: 'english', name: 'English Opening', moves: ['c2c4'] },
]

export interface MasterGame {
  id: string
  white: string
  black: string
  year: number
  result: string
  /** Elo of the players at the time (0 when unknown). */
  whiteRating: number
  blackRating: number
}

/** Strongest games first: by the average rating of the two players. */
export function rankMasters<T extends { whiteRating: number; blackRating: number }>(games: T[]): T[] {
  return [...games].sort((a, b) => b.whiteRating + b.blackRating - (a.whiteRating + a.blackRating))
}

/** The id of a Lichess study, from its link or the id itself (null if it is neither). */
export function studyIdFrom(input: string): string | null {
  const text = input.trim()
  return /lichess\.org\/study\/([A-Za-z0-9]{8})/.exec(text)?.[1] ?? (/^[A-Za-z0-9]{8}$/.test(text) ? text : null)
}

export const lichessStudyUrl = (id: string) => `https://lichess.org/study/${id}`
/** A master game on lichess.org (the page the opening explorer links to). */
export const lichessMasterUrl = (id: string) => `https://lichess.org/import/master/${id}/white`

export async function lichessMastersByOpening(opening: Opening, token?: string): Promise<MasterGame[]> {
  const url = `https://explorer.lichess.ovh/masters?play=${opening.moves.join(',')}&topGames=15&moves=0`
  const data = (await (await get(url, undefined, token)).json()) as {
    topGames?: { id: string; winner: string | null; year: number; white: { name: string; rating?: number }; black: { name: string; rating?: number } }[]
  }
  return rankMasters((data.topGames ?? []).map((g) => ({
    id: g.id,
    whiteRating: g.white.rating ?? 0,
    blackRating: g.black.rating ?? 0,
    white: g.white.name,
    black: g.black.name,
    year: g.year,
    result: g.winner === 'white' ? '1-0' : g.winner === 'black' ? '0-1' : '½-½',
  })))
}

export async function lichessMasterPgn(id: string, token?: string): Promise<string> {
  return cachedPgn(`master:${id}`, () => get(`https://explorer.lichess.ovh/masters/pgn/${encodeURIComponent(id)}`, undefined, token))
}

export interface BroadcastSummary {
  id: string
  name: string
  url: string
}

export async function lichessBroadcasts(query: string): Promise<BroadcastSummary[]> {
  const url = `https://lichess.org/api/broadcast/search?q=${encodeURIComponent(query.trim())}`
  const data = (await (await get(url)).json()) as {
    currentPageResults?: { tour: { id: string; name: string; slug: string } }[]
  }
  return (data.currentPageResults ?? []).map(({ tour }) => ({
    id: tour.id,
    name: tour.name,
    url: `https://lichess.org/broadcast/${tour.slug}/${tour.id}`,
  }))
}

export interface ArchiveMonth {
  url: string
  label: string
}

export async function chessComArchives(player: string): Promise<ArchiveMonth[]> {
  const user = encodeURIComponent(player.trim().toLowerCase())
  const data = (await (await get(`https://api.chess.com/pub/player/${user}/games/archives`)).json()) as {
    archives?: string[]
  }
  return (data.archives ?? [])
    .map((url) => ({ url, label: url.split('/').slice(-2).join('/') }))
    .reverse()
}

export interface ChessComGame {
  url: string
  pgn: string
  white: string
  black: string
}

export async function chessComGames(archiveUrl: string): Promise<ChessComGame[]> {
  const data = (await (await get(archiveUrl)).json()) as {
    games?: { url?: string; pgn?: string; rules?: string; white: { username: string }; black: { username: string } }[]
  }
  return (data.games ?? [])
    .filter((g) => g.rules === 'chess' && g.pgn)
    .map((g) => ({ url: g.url ?? '', pgn: g.pgn!, white: g.white.username, black: g.black.username }))
}

/**
 * The opening a game belongs to, from the Lichess masters database: the name
 * of the deepest position (within the first 20 plies) the database knows.
 */
export async function lichessOpening(uciMoves: string[], token?: string): Promise<{ eco: string; name: string } | null> {
  for (let plies = Math.min(20, uciMoves.length - (uciMoves.length % 2)); plies >= 2; plies -= 2) {
    try {
      const url = `https://explorer.lichess.ovh/masters?play=${uciMoves.slice(0, plies).join(',')}&moves=0&topGames=0`
      const data = (await (await get(url, undefined, token)).json()) as { opening?: { eco: string; name: string } | null }
      if (data.opening) return { eco: data.opening.eco, name: data.opening.name }
    } catch {
      return null
    }
  }
  return null
}
