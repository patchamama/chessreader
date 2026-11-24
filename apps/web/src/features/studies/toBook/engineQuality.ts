import type { DiagramEvaluation } from '../../library/diagramEval/diagramEvalStore'

/** Mate counts as this many centipawns when scores are compared. */
const MATE_CP = 10000
/** A move that costs this much (for the side that played it) is bad. */
export const BAD_LOSS_CP = 150
/** A best move whose best alternative is this much worse stands out as good. */
export const GOOD_GAP_CP = 100

const score = (l: { scoreCp?: number; mate?: number }): number =>
  l.mate !== undefined ? (l.mate > 0 ? MATE_CP - l.mate : -MATE_CP - l.mate) : (l.scoreCp ?? 0)

/**
 * Judge a move with the engine, from the evaluation of the position before it
 * (the side to move) and the one after it (the opponent to move):
 *  - bad: the mover's score fell by BAD_LOSS_CP or more;
 *  - good: it is the engine's first choice and the next best move is
 *    GOOD_GAP_CP or more worse (the move that had to be found);
 *  - otherwise neutral.
 */
export function engineMark(before: DiagramEvaluation, after: DiagramEvaluation, playedUci: string): 'good' | 'bad' | null {
  const best = before.lines[0]
  const reply = after.lines[0]
  if (!best || !reply) return null
  const moverBefore = score(best)
  const moverAfter = -score(reply)
  if (moverBefore - moverAfter >= BAD_LOSS_CP) return 'bad'
  const second = before.lines[1]
  if (best.pv[0] === playedUci && second && moverBefore - score(second) >= GOOD_GAP_CP) return 'good'
  return null
}
