import { Chess } from 'chess.js'
import { notationSegments, type NotationSegment } from '../../shared/info/notationSegments'
import { squareLine } from '../library/utils/squareLine'
import type { Trap } from './traps'

/** A piece of the idea text of a trap: plain text, a line of moves, or squares it names. */
export type IdeaSegment = NotationSegment

/** The positions of the trap line: before each move and after the last (`[i]` is after `i` half-moves). */
export function trapFens(trap: Trap): string[] {
  const c = new Chess()
  const fens = [c.fen()]
  for (const san of trap.sans) { try { c.move(san) } catch { break } fens.push(c.fen()) }
  return fens
}

/**
 * The idea text of a trap cut into plain text, lines of moves (replayable from
 * the trap's line, in the language the text is written in) and the squares and
 * lines of squares it names ("ataque a f7", "la diagonal a2-g8").
 */
export function ideaSegments(text: string, trap: Trap, textLang: string): IdeaSegment[] {
  return notationSegments(text, textLang, trapFens(trap), { squares: true, squarePair: squareLine })
}
