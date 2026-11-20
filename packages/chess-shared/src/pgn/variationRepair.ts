/**
 * Piece-letter repair inside a VARIATION.
 *
 * A book sometimes names the wrong piece in a side line ("28…Rf6" where only the
 * queen can go to f6: Spanish "R" is the king). The mistake shows as an ILLEGAL
 * move. Unlike the main line there is no long continuation to search, so the
 * repair is deliberately narrow:
 *
 *   - candidates are the legal moves to the SAME destination square by ANOTHER
 *     piece, keeping the capture / check marks the source wrote;
 *   - each candidate is tested against the moves that follow in the same line
 *     (recursively: a later wrong letter is repaired the same way);
 *   - the correction is accepted only when exactly one candidate survives or one
 *     keeps strictly more of the following moves legal than every other;
 *   - with nothing following, a UNIQUE candidate is accepted with low confidence.
 */

import { Chess } from 'chess.js';

export interface VariationRepairInput {
  /** Position before the illegal move. */
  fen: string;
  /** The illegal move as written (normalised SAN, annotations allowed). */
  written: string;
  /** The moves that follow it in the same line, in order. */
  upcoming: string[];
  /**
   * Extension point: extra candidate moves (SAN) for this position, e.g. the best
   * moves of an engine. They compete with the piece-letter candidates under the
   * same rule (legal, and backed by the following moves). Not used by default.
   */
  extraCandidates?: (fen: string, written: string) => string[];
}

export interface VariationRepair {
  /** The proposed legal move (SAN with its check mark). */
  san: string;
  /** How many of the following moves are legal after the correction. */
  verifiedPlies: number;
  /** 'low' when nothing follows: the move is illegal as printed and the only fit. */
  confidence: 'high' | 'low';
}

const MAX_LOOKAHEAD = 12;
const MAX_DEPTH = 2;

const strip = (san: string) => san.replace(/[!?]+$/g, '');

interface Shape {
  piece: string;
  dest: string;
  capture: boolean;
  mark: string;
}

function shapeOf(san: string): Shape | null {
  const m = /^([KQRBN])([a-h]?[1-8]?)(x)?([a-h][1-8])([+#]?)$/.exec(strip(san));
  if (!m) return null;
  return { piece: m[1], dest: m[4], capture: !!m[3], mark: m[5] };
}

/** Legal moves to the written destination by another piece, with the written marks. */
function candidatesFor(fen: string, written: string): string[] {
  const w = shapeOf(written);
  if (!w) return [];
  const out: string[] = [];
  for (const move of new Chess(fen).moves()) {
    const c = shapeOf(move);
    if (!c || c.piece === w.piece || c.dest !== w.dest) continue;
    if (w.capture && !c.capture) continue;
    if (w.mark && c.mark !== w.mark) continue;
    out.push(move);
  }
  return out;
}

function playedFrom(fen: string, san: string): Chess | null {
  try {
    const chess = new Chess(fen);
    chess.move(strip(san));
    return chess;
  } catch {
    return null;
  }
}

/** How many of `sans` can be played in order, repairing a later wrong letter. */
function follow(fen: string, sans: string[], depth: number): number {
  if (sans.length === 0) return 0;
  const direct = playedFrom(fen, sans[0]);
  if (direct) return 1 + follow(direct.fen(), sans.slice(1), depth);
  if (depth <= 0) return 0;
  let best = 0;
  for (const alt of candidatesFor(fen, sans[0])) {
    const next = playedFrom(fen, alt);
    if (next) best = Math.max(best, 1 + follow(next.fen(), sans.slice(1), depth - 1));
  }
  return best;
}

export function findVariationRepair(input: VariationRepairInput): VariationRepair | null {
  if (playedFrom(input.fen, input.written)) return null; // legal: nothing to repair
  const upcoming = input.upcoming.slice(0, MAX_LOOKAHEAD);

  const moves = new Set(candidatesFor(input.fen, input.written));
  for (const extra of input.extraCandidates?.(input.fen, input.written) ?? []) {
    if (playedFrom(input.fen, extra)) moves.add(extra);
  }
  const scored = [...moves].map((san) => {
    const after = playedFrom(input.fen, san)!;
    return { san, plies: follow(after.fen(), upcoming, MAX_DEPTH) };
  });
  if (scored.length === 0) return null;
  // Nothing follows: no evidence to rank candidates, so only a UNIQUE one counts.
  if (upcoming.length === 0) {
    return scored.length === 1 ? { san: scored[0].san, verifiedPlies: 0, confidence: 'low' } : null;
  }
  scored.sort((a, b) => b.plies - a.plies);

  const [best, runnerUp] = scored;
  // The following moves must back the correction: at least two of them (or the
  // only one) are legal after it.
  if (best.plies < Math.min(upcoming.length, 2)) return null;
  if (runnerUp && runnerUp.plies >= best.plies) return null; // ambiguous
  return { san: best.san, verifiedPlies: best.plies, confidence: 'high' };
}
