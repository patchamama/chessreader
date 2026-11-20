import { Chess } from 'chess.js'

export interface PositionMove { label: string; fen: string }
export type PositionInput =
  | { kind: 'fen'; fen: string }
  | { kind: 'pgn'; moves: PositionMove[] }
  | { kind: 'error'; message: string }

const NOT_VALID = 'This is not a valid FEN or PGN.'

/** A pasted FEN (one position) or PGN (the FEN after each of its moves). */
export function parsePositionInput(raw: string): PositionInput {
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
  try {
    const chess = new Chess()
    chess.loadPgn(text)
    const moves = chess.history({ verbose: true }).map((m, i) => ({
      label: `${Math.floor(i / 2) + 1}${i % 2 === 0 ? '. ' : '... '}${m.san}`,
      fen: m.after,
    }))
    return moves.length ? { kind: 'pgn', moves } : { kind: 'error', message: NOT_VALID }
  } catch {
    return { kind: 'error', message: NOT_VALID }
  }
}
