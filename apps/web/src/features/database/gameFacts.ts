/** What a game list says about each game, when it is known. */
export interface GameFacts {
  moves?: number | null
  result?: string | null
  /** How it ended: resignation, checkmate, draw, perpetual check, stalemate, repetition, time… */
  termination?: string | null
  whiteElo?: number | null
  blackElo?: number | null
  place?: string | null
  event?: string | null
}

/** "40 moves", "1-0 (resignation)", "Elo 2650–2620", place and event: only the parts that are known. */
export function gameFacts(g: GameFacts): string[] {
  const parts: string[] = []
  if (g.moves) parts.push(`${g.moves} moves`)
  const result = g.result && g.result !== '*' ? g.result : null
  if (result || g.termination) parts.push(result && g.termination ? `${result} (${g.termination})` : (result ?? g.termination!))
  if (g.whiteElo || g.blackElo) parts.push(`Elo ${g.whiteElo || '?'}–${g.blackElo || '?'}`)
  // The event usually names the place already ("Riga 1954 · Copa de la URSS").
  if (g.place && !g.event?.includes(g.place)) parts.push(g.place)
  if (g.event) parts.push(g.event)
  return parts
}

const TERMINATIONS: [RegExp, string][] = [
  [/resign/i, 'resignation'], [/checkmate/i, 'checkmate'], [/time|flag/i, 'time'], [/stalemate/i, 'stalemate'],
  [/repetition/i, 'repetition'], [/agree/i, 'agreement'], [/insufficient/i, 'insufficient material'], [/abandon/i, 'abandoned'],
]
const tag = (pgn: string, name: string) => {
  const v = new RegExp(`^\\[${name}\\s+"([^"]*)"\\]`, 'm').exec(pgn)?.[1]?.trim()
  return v && v !== '?' && v !== '-' ? v : null
}
const rating = (v: string | null) => (v && /^\d{3,4}$/.test(v) ? Number(v) : null)

/** The facts of a PGN game: its tags (Result, Termination, Elo, Site, Event) and the moves of its main line. */
export function pgnFacts(pgn: string): Required<GameFacts> {
  let body = pgn.replace(/^\[.*\]\s*$/gm, '').replace(/\{[^}]*\}/g, ' ').replace(/;[^\n]*/g, ' ')
  // Variations, innermost first.
  for (let prev = ''; prev !== body;) { prev = body; body = body.replace(/\([^()]*\)/g, ' ') }
  const sans = body.split(/\s+/).map((t) => t.replace(/^\d+\.(?:\.\.)?/, '')).filter((t) => t && !/^(?:\$\d+|1-0|0-1|1\/2-1\/2|½-½|\*)$/.test(t))
  let result = tag(pgn, 'Result')?.replace('1/2-1/2', '½-½') ?? null
  const term = tag(pgn, 'Termination')
  let termination = term ? (TERMINATIONS.find(([re]) => re.test(term))?.[1] ?? null) : null
  if (!termination && sans[sans.length - 1]?.endsWith('#')) termination = 'checkmate'
  if ((!result || result === '*') && termination === 'checkmate') result = sans.length % 2 ? '1-0' : '0-1'
  return {
    moves: sans.length ? Math.ceil(sans.length / 2) : null,
    result, termination,
    whiteElo: rating(tag(pgn, 'WhiteElo')), blackElo: rating(tag(pgn, 'BlackElo')),
    place: tag(pgn, 'Site'), event: tag(pgn, 'Event'),
  }
}
