/**
 * Playing a real (casual, unrated) game on Lichess from this board, through the
 * Lichess Board API. Needs a personal token with the `board:play` permission;
 * every call goes straight from the browser to lichess.org.
 */
/** Playing: a seek (board:play) and a challenge to the Lichess AI (challenge:write). */
export const LICHESS_PLAY_TOKEN_URL = lichessTokenUrl(['board:play', 'challenge:write'], 'Chess reader play')

/** Clocks offered for a Lichess game (minutes + increment in seconds); the first is the default. */
export const LICHESS_CLOCKS: { minutes: number; increment: number }[] = [
  { minutes: 10, increment: 5 }, { minutes: 5, increment: 3 }, { minutes: 10, increment: 0 },
  { minutes: 15, increment: 10 }, { minutes: 30, increment: 0 }, { minutes: 30, increment: 20 },
]
import { lichessTokenUrl } from '../../shared/lichess/tokenUrl'

export { lichessTokenUrl }
const API = 'https://lichess.org/api'

function check(res: { ok: boolean; status: number }) {
  if (res.status === 401) throw new Error('Lichess rejected the token (401): it needs the board:play permission.')
  if (!res.ok) throw new Error(`lichess.org answered ${res.status}`)
}

/** Feed each JSON line of a stream to `onItem` (empty keep-alive lines are skipped). */
export async function readNdjson(body: ReadableStream<Uint8Array>, onItem: (item: unknown) => void): Promise<void> {
  const reader = body.getReader()
  const dec = new TextDecoder()
  let buf = ''
  for (;;) {
    const { value, done } = await reader.read()
    if (value) buf += dec.decode(value, { stream: true })
    let nl: number
    while ((nl = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, nl).trim()
      buf = buf.slice(nl + 1)
      if (line) onItem(JSON.parse(line))
    }
    if (done) break
  }
  if (buf.trim()) onItem(JSON.parse(buf))
}

/** Look for an opponent (casual game). The request stays open until a game starts or `signal` aborts it. */
export async function lichessSeek(token: string, clock: { minutes: number; increment: number }, signal: AbortSignal): Promise<void> {
  const res = await fetch(`${API}/board/seek`, {
    method: 'POST', signal,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `rated=false&time=${clock.minutes}&increment=${clock.increment}`,
  })
  check(res)
  if (res.body) await readNdjson(res.body, () => {})
}

/** Challenge the Lichess AI (Stockfish, level 1–8): the game starts at once; its id. */
export async function lichessChallengeAi(token: string, o: { level: number; clock: { minutes: number; increment: number }; color: 'white' | 'black' }): Promise<string> {
  const res = await fetch(`${API}/challenge/ai`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `level=${o.level}&clock.limit=${o.clock.minutes * 60}&clock.increment=${o.clock.increment}&color=${o.color}`,
  })
  if (res.status === 401 || res.status === 403) throw new Error('Lichess rejected the token: it needs the board:play and challenge:write permissions.')
  check(res)
  return ((await res.json()) as { id: string }).id
}

/** The account's events (a game starting…), until `signal` aborts. */
export async function lichessEvents(token: string, onEvent: (e: { type: string; game?: { gameId: string; color: 'white' | 'black' } }) => void, signal: AbortSignal) {
  const res = await fetch(`${API}/stream/event`, { headers: { Authorization: `Bearer ${token}` }, signal })
  check(res)
  if (res.body) await readNdjson(res.body, (x) => onEvent(x as never))
}

/** A game's state: moves so far (UCI), status, and the clocks in milliseconds. */
export interface LichessGameState { moves: string; status: string; winner?: string; wtime?: number; btime?: number; winc?: number; binc?: number }

export interface LichessPlayer { id?: string; name?: string; rating?: number; title?: string | null; aiLevel?: number; provisional?: boolean }

/** What Lichess tells about the game when it starts: the players, the speed, rated or not. */
export interface LichessGameFull { id: string; speed?: string; rated?: boolean; white: LichessPlayer; black: LichessPlayer; state: LichessGameState }

/** A game's moves as they are played: the full game first, then each state. */
export async function lichessGameStream(token: string, gameId: string, onState: (s: LichessGameState) => void, signal: AbortSignal, onFull?: (g: LichessGameFull) => void) {
  const res = await fetch(`${API}/board/game/stream/${gameId}`, { headers: { Authorization: `Bearer ${token}` }, signal })
  check(res)
  if (res.body) {
    await readNdjson(res.body, (x) => {
      const e = x as { type: string; state?: LichessGameState } & LichessGameState
      if (e.type === 'gameFull' && e.state) { onFull?.(x as LichessGameFull); onState(e.state) }
      else if (e.type === 'gameState') onState(e)
    })
  }
}

/** Lichess bots that play like people of a given level (Maia: trained on human games). */
export const LICHESS_BOTS = [
  { id: 'maia1', label: 'Maia 1100 (human-like)' },
  { id: 'maia5', label: 'Maia 1500 (human-like)' },
  { id: 'maia9', label: 'Maia 1900 (human-like)' },
] as const

/** Challenge a Lichess bot (casual); the game starts when it accepts (an event on the account stream). */
export async function lichessChallengeBot(token: string, bot: string, o: { clock: { minutes: number; increment: number }; color: 'white' | 'black' }): Promise<void> {
  const res = await fetch(`${API}/challenge/${bot}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `rated=false&clock.limit=${o.clock.minutes * 60}&clock.increment=${o.clock.increment}&color=${o.color}`,
  })
  if (res.status === 401 || res.status === 403) throw new Error('Lichess rejected the token: it needs the board:play and challenge:write permissions.')
  check(res)
}

export async function lichessMakeMove(token: string, gameId: string, uci: string): Promise<void> {
  check(await fetch(`${API}/board/game/${gameId}/move/${uci}`, { method: 'POST', headers: { Authorization: `Bearer ${token}` } }))
}

export async function lichessResign(token: string, gameId: string): Promise<void> {
  check(await fetch(`${API}/board/game/${gameId}/resign`, { method: 'POST', headers: { Authorization: `Bearer ${token}` } }))
}
