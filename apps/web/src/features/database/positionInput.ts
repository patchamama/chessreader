import { Chess } from 'chess.js'
import type { HumanComment } from '../library/commentdb/commentLookup'
import type { CommentEntry, CommentFilter, CommentSource } from '../comments/commentsApi'
import { positionHash } from '@chess-ebook/chess-shared'
import { normalizePgn, type PgnLanguage, type PgnLanguageChoice, type Unrecognised } from './pgnNormalize'

export interface PositionMove { label: string; fen: string; san?: string }
export interface PgnReading { /** The position the moves start from. */ start: string; /** The PGN with the numbers and letter case fixed. */ text: string; language: PgnLanguage; unrecognised: Unrecognised[] }
export type PositionInput =
  | { kind: 'fen'; fen: string }
  | ({ kind: 'pgn'; moves: PositionMove[] } & PgnReading)
  | { kind: 'error'; message: string; /** Moves read before the first one that was not recognised. */ moves?: PositionMove[]; reading?: PgnReading }

const NOT_VALID = 'This is not a valid FEN or PGN.'

/** A pasted FEN (one position) or PGN (the FEN after each of its moves). */
export function parsePositionInput(raw: string, language: PgnLanguageChoice = 'auto'): PositionInput {
  const text = raw.trim()
  if (!text) return { kind: 'error', message: 'Paste a FEN or a PGN.' }
  if (!text.includes('[') && text.split('/').length === 8) {
    try {
      new Chess(text)
      return { kind: 'fen', fen: text.replace(/\s+/g, ' ') }
    } catch {
      return { kind: 'error', message: NOT_VALID }
    }
  }
  const n = normalizePgn(text, { language })
  const moves: PositionMove[] = n.moves.map((m) => ({ label: m.label, fen: m.fen, san: m.san }))
  if (n.unrecognised.length) {
    const message = `${NOT_VALID} ${describeUnrecognised(n.unrecognised)}`
    return moves.length ? { kind: 'error', message, moves, reading: { start: n.start, text: n.text, language: n.language, unrecognised: n.unrecognised } } : { kind: 'error', message }
  }
  return moves.length ? { kind: 'pgn', moves, start: n.start, text: n.text, language: n.language, unrecognised: [] } : { kind: 'error', message: NOT_VALID }
}

/** "Not recognised: "N@c6" at 2... N@c6 (unknown characters: @)". */
export function describeUnrecognised(list: Unrecognised[]): string {
  return `Not recognised: ${list.map((u) => `"${u.token}" at ${u.label}${u.chars.length ? ` (unknown characters: ${u.chars.join(' ')})` : ' (not a legal move there)'}`).join('; ')}.`
}

export type FinderFilter = Pick<CommentFilter, 'q' | 'lang' | 'kind'> & { source?: number }

/** The comments of a position that pass the filters of the Comments list (search, source, language, origin). */
export function filterFound(comments: HumanComment[], filter: FinderFilter | undefined, sources: CommentSource[] = []): HumanComment[] {
  if (!filter) return comments
  const q = filter.q?.trim().toLocaleLowerCase()
  const source = filter.source ? sources.find((s) => s.id === filter.source) : undefined
  return comments.filter((c) =>
    (!q || [c.text, ...Object.values(c.translations ?? {})].some((t) => t.toLocaleLowerCase().includes(q))) &&
    (!filter.source || (source ? c.source.title === source.title : true)) &&
    (!filter.lang || c.lang === filter.lang) &&
    (!filter.kind || c.source.kind === filter.kind))
}


/** The moves of a line with their numbered labels and the FEN after each one. */
export function replayLine(start: string, sans: string[]): PositionMove[] {
  const out: PositionMove[] = []
  let chess: Chess
  try { chess = new Chess(start) } catch { return out }
  for (const san of sans) {
    const label = `${chess.moveNumber()}${chess.turn() === 'w' ? '. ' : '... '}${san}`
    try { chess.move(san) } catch { break }
    out.push({ label, fen: chess.fen(), san })
  }
  return out
}

/** The editor wants a database entry: what the finder knows of the comment, plus its position. */
export function entryOf(c: HumanComment, fen: string, sources: CommentSource[]): CommentEntry {
  const source = sources.find((s) => s.title === c.source.title)
  return {
    id: c.id ?? 0, hash: positionHash(fen), fen, text: c.text, lang: c.lang, ply: c.ply, move: Math.ceil(c.ply / 2), san: c.san, gameId: c.gameId, chapter: null,
    source: { id: source?.id ?? 0, title: c.source.title, author: c.source.author, kind: c.source.kind, lang: source?.lang ?? c.lang, book: source?.book ?? null },
    game: { white: null, black: null, label: c.label },
    ...(c.translations ? { translations: c.translations } : {}),
  }
}

