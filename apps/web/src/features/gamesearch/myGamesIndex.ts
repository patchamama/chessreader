/**
 * An index of all the user's games: read once per account and session, then
 * grouped into the years and months that have games, with their counts.
 */
import { chessComGamesOfMonth, LICHESS_EXPORT_PARAMS, lichessAuth, parseLichessGame, type MyGame } from './myGames'

export interface MonthGroup { month: number; games: MyGame[] }
export interface YearGroup { year: number; count: number; months: MonthGroup[] }

const newestFirst = (a: MyGame, b: MyGame) => b.date.localeCompare(a.date)

/** All games, newest first, grouped by year and month; empty years and months are left out. */
export function groupGames(games: MyGame[]): YearGroup[] {
  const years: YearGroup[] = []
  for (const g of [...games].sort(newestFirst)) {
    const year = Number(g.date.slice(0, 4)), month = Number(g.date.slice(5, 7))
    let y = years[years.length - 1]
    if (!y || y.year !== year) years.push((y = { year, count: 0, months: [] }))
    let m = y.months[y.months.length - 1]
    if (!m || m.month !== month) y.months.push((m = { month, games: [] }))
    m.games.push(g)
    y.count++
  }
  return years
}

/** Every game of a Lichess user in one ndjson export, read as it streams in. */
export async function lichessAllGames(token: string, user: string, onProgress: (n: number) => void): Promise<MyGame[]> {
  const url = `https://lichess.org/api/games/user/${encodeURIComponent(user)}?${LICHESS_EXPORT_PARAMS}`
  const res = await fetch(url, { headers: { Accept: 'application/x-ndjson', ...lichessAuth(token) } })
  if (!res.ok) throw new Error(`lichess.org answered ${res.status}`)
  const games: MyGame[] = []
  const take = (lines: string[]) => {
    for (const l of lines) if (l.trim()) games.push(parseLichessGame(l))
    onProgress(games.length)
  }
  const reader = res.body?.getReader()
  if (!reader) {
    take((await res.text()).split('\n'))
    return games
  }
  const decoder = new TextDecoder()
  let rest = ''
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    const lines = (rest + decoder.decode(value, { stream: true })).split('\n')
    rest = lines.pop() ?? ''
    take(lines)
  }
  take([rest + decoder.decode()])
  return games
}

/** Every game of a chess.com user: only the months its archive list names, newest first. */
export async function chessComAllGames(user: string, onProgress: (n: number) => void): Promise<MyGame[]> {
  const name = encodeURIComponent(user.trim().toLowerCase())
  const res = await fetch(`https://api.chess.com/pub/player/${name}/games/archives`)
  if (res.status === 404) return []
  if (!res.ok) throw new Error(`api.chess.com answered ${res.status}`)
  const { archives = [] } = (await res.json()) as { archives?: string[] }
  const months = archives.map((a) => a.split('/').slice(-2).map(Number) as [number, number]).sort((a, b) => b[0] - a[0] || b[1] - a[1])
  const games: MyGame[] = []
  for (const [year, month] of months) {
    games.push(...(await chessComGamesOfMonth(user, year, month)).sort(newestFirst))
    onProgress(games.length)
  }
  return games
}

const cache = new Map<string, YearGroup[]>()

/** Forget the indexes read in this session. */
export function clearGameIndexCache() {
  cache.clear()
}

/** The index of an account's games, read once per session. */
export async function loadGameIndex(source: 'lichess' | 'chesscom', user: string, token: string, onProgress: (n: number) => void): Promise<YearGroup[]> {
  const key = `${source}:${user.toLowerCase()}`
  const hit = cache.get(key)
  if (hit) return hit
  const games = source === 'lichess' ? await lichessAllGames(token, user, onProgress) : await chessComAllGames(user, onProgress)
  const index = groupGames(games)
  cache.set(key, index)
  return index
}
