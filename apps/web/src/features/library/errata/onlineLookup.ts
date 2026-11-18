import { Chess } from 'chess.js'
import { sanSimilarity } from '@chess-ebook/chess-shared'
import { bookSlug, coreMove } from './errataFormat'
import { detectNotation, printedToEnglish } from './errataNotation'

/**
 * Online reference for a game whose printed main line has a wrong move: the
 * Lichess masters database (explorer.lichess.ovh, CORS allowed, a personal
 * token since 2025) is searched by the game's own moves, then the master game
 * is compared ply by ply with the book (marks stripped, book letters
 * converted). No other site is read.
 *
 * Its coverage is over-the-board master games, mostly from 1952 on: a game of
 * the 19th century is usually NOT there, and the lookup says so.
 */

const EXPLORER = 'https://explorer.lichess.ovh/masters'
const MASTERS_FROM = 1952
/** At most this many wrong moves are bridged to keep searching past them. */
const MAX_BRIDGES = 3

export interface Substitution { ply: number; from: string; to: string }

export type OnlineLookupResult =
  | { status: 'found'; id: string; url: string; white: string; black: string; year?: number; reference: string[]; changes: Substitution[] }
  | { status: 'not-found'; reason: string }
  | { status: 'needs-token'; reason: string }

/** The printed main line in English SAN: marks (!, ?, !?, !!) stripped, book letters and 0-0 converted. */
export function normaliseBookMoves(printed: string[]): string[] {
  const notation = detectNotation(printed)
  return printed.map((m) => printedToEnglish(m, notation))
}

const bare = (san: string) => coreMove(san).replace(/[+#]/g, '')

/**
 * The minimal substitutions that turn the printed line into the reference,
 * ply by ply over the plies both have; null when so many differ that the
 * reference is another game.
 */
export function proposeSubstitutions(printed: string[], reference: string[]): Substitution[] | null {
  const book = normaliseBookMoves(printed)
  const n = Math.min(book.length, reference.length)
  if (n === 0) return null
  const out: Substitution[] = []
  for (let i = 0; i < n; i++) {
    if (bare(book[i]) !== bare(reference[i])) out.push({ ply: i + 1, from: printed[i], to: coreMove(reference[i]) })
  }
  return out.length > Math.max(3, Math.floor(n * 0.1)) ? null : out
}

/**
 * The book line as UCI moves, bridging a wrong move with the legal move after
 * which the following book moves stay legal the longest (so the search can
 * use the whole game, not only the moves before the misprint).
 */
function bridgedUci(book: string[]): string[] {
  const chess = new Chess()
  const uci: string[] = []
  let bridges = 0
  const fits = (start: number, first: string) => {
    const probe = new Chess(chess.fen())
    try { probe.move(first) } catch { return -1 }
    let n = 0
    for (let j = start; j < Math.min(book.length, start + 6); j++) {
      try { probe.move(book[j]); n++ } catch { break }
    }
    return n
  }
  for (let i = 0; i < book.length; i++) {
    let played
    try {
      played = chess.move(book[i])
    } catch {
      if (bridges >= MAX_BRIDGES) break
      const ranked = chess.moves()
        .map((m) => ({ m, n: fits(i + 1, m), s: sanSimilarity(book[i], m) }))
        .sort((a, b) => b.n - a.n || b.s - a.s)
      const best = ranked[0]
      if (!best || (best.n === 0 && i < book.length - 1)) break
      bridges++
      played = chess.move(best.m)
    }
    uci.push(`${played.from}${played.to}${played.promotion ?? ''}`)
  }
  return uci
}

const words = (name: string) => bookSlug(name).split('-').filter((w) => w.length > 2)
/** "E. Lasker" matches "Lasker, Emanuel": the book's surname is one of the database name's words. */
function samePlayer(book: string | null | undefined, db: string): boolean {
  if (!book) return true
  const surname = words(book).pop()
  return !!surname && words(db).includes(surname)
}

interface TopGame { id: string; year?: number; white: { name: string }; black: { name: string } }

export async function findOnlineReference(
  game: { printed: string[]; white?: string | null; black?: string | null; year?: number | null },
  options: { token?: string; fetch?: typeof fetch } = {},
): Promise<OnlineLookupResult> {
  const fetchFn = options.fetch ?? fetch
  const headers: Record<string, string> = options.token ? { Authorization: `Bearer ${options.token}` } : {}
  const old = game.year && game.year < MASTERS_FROM
    ? ` Games played before ${MASTERS_FROM} (this one: ${game.year}) are usually not in it.`
    : ` It holds over-the-board master games, mostly from ${MASTERS_FROM} on.`
  const notFound = (why: string): OnlineLookupResult => ({ status: 'not-found', reason: why + old })
  const uci = bridgedUci(normaliseBookMoves(game.printed))
  if (uci.length < 8) return notFound('The game is too short to search by its moves.')

  const depths: number[] = []
  for (let d = uci.length; d >= 16; d -= 8) depths.push(d)
  if (!depths.length) depths.push(uci.length)
  let sawOthers = false
  for (const d of depths) {
    let res: Response
    try {
      res = await fetchFn(`${EXPLORER}?play=${uci.slice(0, d).join(',')}&moves=0&topGames=15`, { headers })
    } catch {
      return { status: 'not-found', reason: 'Lichess could not be reached.' }
    }
    if (res.status === 401) {
      return { status: 'needs-token', reason: 'The Lichess masters database needs a personal Lichess token (Settings).' }
    }
    if (!res.ok) return { status: 'not-found', reason: `Lichess answered ${res.status}.` }
    const data = (await res.json()) as { white?: number; draws?: number; black?: number; topGames?: TopGame[] }
    const total = (data.white ?? 0) + (data.draws ?? 0) + (data.black ?? 0)
    if (total === 0) continue
    const knownPlayers = !!(game.white || game.black)
    const pick = (data.topGames ?? []).find((g) =>
      knownPlayers
        ? samePlayer(game.white, g.white.name) && samePlayer(game.black, g.black.name) && (!game.year || !g.year || Math.abs(g.year - game.year) <= 1)
        : total === 1 && d >= 20)
    if (!pick) { sawOthers = true; continue }
    const pgnRes = await fetchFn(`${EXPLORER}/pgn/${encodeURIComponent(pick.id)}`, { headers })
    if (!pgnRes.ok) return { status: 'not-found', reason: `Lichess answered ${pgnRes.status} for game ${pick.id}.` }
    const chess = new Chess()
    try {
      chess.loadPgn(await pgnRes.text())
    } catch {
      return { status: 'not-found', reason: `The PGN of game ${pick.id} could not be read.` }
    }
    const reference = chess.history()
    const changes = proposeSubstitutions(game.printed, reference)
    if (!changes) return notFound(`Game ${pick.id} of these players differs too much from the book: it is another game.`)
    return {
      status: 'found', id: pick.id, url: `https://lichess.org/import/master/${pick.id}/white`,
      white: pick.white.name, black: pick.black.name, year: pick.year, reference, changes,
    }
  }
  return notFound(sawOthers
    ? 'The Lichess masters database has these moves, but not a game of these players.'
    : 'The Lichess masters database has no game with these moves.')
}
