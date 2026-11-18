/**
 * The user's own games, month by month: from Lichess (with the token in
 * Settings) and from chess.com (its public, read-only archive by user name —
 * chess.com has no API to play or sign in).
 */
export interface MyGame {
  id: string
  source: 'lichess' | 'chesscom'
  url: string
  date: string
  white: string
  black: string
  whiteElo?: number
  blackElo?: number
  result: string
  /** How it ended: mate, resign, timeout, draw… */
  ending: string
  opening: string
  moves: number
  speed: string
  pgn: string
}

/** Months from `from` to `to`, newest first, grouped by year. */
export function monthsBetween(from: Date, to: Date): { year: number; months: number[] }[] {
  const out: { year: number; months: number[] }[] = []
  let y = to.getUTCFullYear()
  let m = to.getUTCMonth() + 1
  const endY = from.getUTCFullYear(), endM = from.getUTCMonth() + 1
  while (y > endY || (y === endY && m >= endM)) {
    if (!out.length || out[out.length - 1].year !== y) out.push({ year: y, months: [] })
    out[out.length - 1].months.push(m)
    if (--m === 0) { m = 12; y-- }
  }
  return out
}

/** Full moves in a list of SAN moves or a PGN move text. */
export function moveCount(moves: string): number {
  const sans = moves.replace(/\{[^}]*\}/g, ' ').replace(/\d+\.(\.\.)?/g, ' ').replace(/(1-0|0-1|1\/2-1\/2|\*)\s*$/, '').trim().split(/\s+/).filter(Boolean)
  return Math.ceil(sans.length / 2)
}

/** Authorization header for a Lichess token. */
export const lichessAuth = (token: string) => ({ Authorization: `Bearer ${token}` })

/** The account behind a Lichess token. */
export async function lichessAccount(token: string): Promise<{ username: string; createdAt: number }> {
  const res = await fetch('https://lichess.org/api/account', { headers: lichessAuth(token) })
  if (!res.ok) throw new Error(res.status === 401 ? 'Lichess rejected the token (401).' : `lichess.org answered ${res.status}`)
  const a = (await res.json()) as { username: string; createdAt: number }
  return { username: a.username, createdAt: a.createdAt }
}

interface LichessPlayer { user?: { name: string }; aiLevel?: number; rating?: number }

const lichessName = (p: LichessPlayer) => p.user?.name ?? (p.aiLevel ? `Lichess AI level ${p.aiLevel}` : '?')

/** One line of a Lichess ndjson game export as a game row. */
export function parseLichessGame(line: string): MyGame {
  const g = JSON.parse(line) as { id: string; createdAt: number; status: string; winner?: string; speed: string; moves?: string; opening?: { name: string }; players: { white: LichessPlayer; black: LichessPlayer }; pgn: string }
  return {
    id: g.id, source: 'lichess' as const, url: `https://lichess.org/${g.id}`, date: new Date(g.createdAt).toISOString().slice(0, 10),
    white: lichessName(g.players.white), black: lichessName(g.players.black),
    ...(g.players.white.rating ? { whiteElo: g.players.white.rating } : {}), ...(g.players.black.rating ? { blackElo: g.players.black.rating } : {}),
    result: g.winner === 'white' ? '1-0' : g.winner === 'black' ? '0-1' : ['draw', 'stalemate'].includes(g.status) ? '½-½' : '*',
    ending: g.status, opening: g.opening?.name ?? '', moves: moveCount(g.moves ?? ''), speed: g.speed, pgn: g.pgn,
  }
}

/** Query of a Lichess game export: PGN inside each JSON line, with the opening. */
export const LICHESS_EXPORT_PARAMS = 'pgnInJson=true&opening=true&clocks=false&evals=false'

/** One month of a Lichess user's games. */
export async function lichessGamesOfMonth(token: string, user: string, year: number, month: number): Promise<MyGame[]> {
  const since = Date.UTC(year, month - 1, 1), until = Date.UTC(year, month, 1)
  const url = `https://lichess.org/api/games/user/${encodeURIComponent(user)}?since=${since}&until=${until}&${LICHESS_EXPORT_PARAMS}`
  const res = await fetch(url, { headers: { Accept: 'application/x-ndjson', ...lichessAuth(token) } })
  if (!res.ok) throw new Error(`lichess.org answered ${res.status}`)
  return (await res.text()).split('\n').filter((l) => l.trim()).map(parseLichessGame)
}

const LOSS = new Set(['checkmated', 'resigned', 'timeout', 'abandoned', 'lose'])

/** One month of a chess.com user's games (public archive). */
export async function chessComGamesOfMonth(user: string, year: number, month: number): Promise<MyGame[]> {
  const url = `https://api.chess.com/pub/player/${encodeURIComponent(user.trim().toLowerCase())}/games/${year}/${String(month).padStart(2, '0')}`
  const res = await fetch(url)
  if (res.status === 404) return []
  if (!res.ok) throw new Error(`api.chess.com answered ${res.status}`)
  const data = (await res.json()) as { games?: { url: string; pgn?: string; end_time: number; time_class: string; rules: string; eco?: string; white: { username: string; rating: number; result: string }; black: { username: string; rating: number; result: string } }[] }
  return (data.games ?? []).filter((g) => g.rules === 'chess' && g.pgn).map((g) => {
    const moves = g.pgn!.slice(g.pgn!.indexOf('\n\n') + 2)
    const result = g.white.result === 'win' ? '1-0' : g.black.result === 'win' ? '0-1' : '½-½'
    const loser = LOSS.has(g.white.result) ? g.white.result : LOSS.has(g.black.result) ? g.black.result : g.white.result
    const opening = g.eco ? decodeURIComponent(g.eco.split('/').pop() ?? '').replace(/-/g, ' ').replace(/\s+\d.*$/, '') : (/\[Opening "([^"]+)"\]/.exec(g.pgn!)?.[1] ?? '')
    return {
      id: g.url.split('/').pop() ?? g.url, source: 'chesscom' as const, url: g.url, date: new Date(g.end_time * 1000).toISOString().slice(0, 10),
      white: g.white.username, black: g.black.username, whiteElo: g.white.rating, blackElo: g.black.rating,
      result, ending: result === '½-½' ? 'draw' : loser, opening, moves: moveCount(moves), speed: g.time_class, pgn: g.pgn!,
    }
  })
}
