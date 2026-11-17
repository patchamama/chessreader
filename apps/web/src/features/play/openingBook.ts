/**
 * Is a move "book"? It is when it reaches a position of a named opening
 * (the Lichess chess-openings table, CC0, shipped with the app and read
 * offline) or, with a Lichess token, when masters have played it.
 */
export interface BookMove { eco: string; name: string; source: 'eco' | 'masters' }

let table: Promise<Record<string, [string, string]>> | null = null

const epd = (fen: string) => fen.split(' ').slice(0, 4).join(' ')

function ecoTable() {
  // A failed load is not kept: the next move tries again.
  table ??= fetch(`${import.meta.env.BASE_URL ?? '/'}openings/eco.json`)
    .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
    .catch(() => { table = null; return {} })
  return table
}

/** Test hook: forget the loaded table. */
export function clearOpeningBook() {
  table = null
}

/** The opening a position belongs to, from the offline table. */
export async function openingOf(fen: string): Promise<{ eco: string; name: string } | null> {
  const hit = (await ecoTable())[epd(fen)]
  return hit ? { eco: hit[0], name: hit[1] } : null
}

/** Whether `uci`, played from `fenBefore` (reaching `fenAfter`), is a book move. */
export async function bookMove(fenBefore: string, uci: string, fenAfter: string, token?: string): Promise<BookMove | null> {
  const named = await openingOf(fenAfter)
  if (named) return { ...named, source: 'eco' }
  if (!token) return null
  try {
    const res = await fetch(`https://explorer.lichess.ovh/masters?fen=${encodeURIComponent(fenBefore)}&topGames=0`, { headers: { Authorization: `Bearer ${token}` } })
    if (!res.ok) return null
    const data = (await res.json()) as { moves: { uci: string; white: number; draws: number; black: number }[] }
    const m = data.moves.find((x) => x.uci === uci)
    if (!m) return null
    const games = m.white + m.draws + m.black
    return { eco: '', name: `played in ${games} master game${games === 1 ? '' : 's'}`, source: 'masters' }
  } catch {
    return null
  }
}
