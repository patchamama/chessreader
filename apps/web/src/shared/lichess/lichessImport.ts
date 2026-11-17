/**
 * Import a game into Lichess and get the address of its analysis board
 * (server analysis, opening explorer, sharing). A token is optional: it puts
 * the game in the user's account and lifts the anonymous rate limit.
 */
export async function lichessImportGame(pgn: string, token?: string): Promise<string> {
  const headers: Record<string, string> = { 'Content-Type': 'application/x-www-form-urlencoded' }
  if (token) headers.Authorization = `Bearer ${token}`
  headers.Accept = 'application/json'
  const res = await fetch('https://lichess.org/api/import', {
    method: 'POST',
    headers,
    body: new URLSearchParams({ pgn }).toString(),
  })
  const data = (await res.json().catch(() => ({}))) as { url?: string; error?: string }
  if (!res.ok || !data.url) throw new Error(`Lichess could not import the game: ${data.error ?? `error ${res.status}`}`)
  return data.url
}
