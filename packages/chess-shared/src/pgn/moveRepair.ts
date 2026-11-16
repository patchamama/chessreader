/**
 * Wrong-move repair.
 *
 * A printed game sometimes carries a wrong move: a typo ("Bc5" for "Bc4"), a
 * wrong square, a wrong piece letter. The mistake shows up as an ILLEGAL move —
 * either the wrong move itself, or a later move that no longer fits because a
 * legal-but-wrong move was played some plies earlier ("2... d5" for "2... d6"
 * only fails at "5... dxe5").
 *
 * The game's own continuation is the evidence: the right correction is the one
 * after which the moves that FOLLOW in the text are legal again. Candidates are
 * the legal moves that resemble what was written; each is scored by how many of
 * the upcoming moves it lets us play.
 */

import { Chess } from 'chess.js';

export interface MoveRepair {
  /** Index (0-based ply in the line) of the move to replace. */
  index: number;
  /** What the source says at that ply. */
  written: string;
  /** The proposed legal move. */
  san: string;
  /** 'high': the continuation singles it out; 'low': other candidates tie. */
  confidence: 'high' | 'low';
  /** Other repairs the continuation backs equally well (may be empty). They can
   *  replace a different ply: "5... dxe4" here, or "2... d6" three moves back. */
  alternatives: Array<{ index: number; written: string; san: string }>;
  /** How many of the upcoming moves are legal after the repair. */
  verifiedPlies: number;
}

export interface RepairInput {
  startFen: string;
  /** Moves accepted so far (all legal from startFen). */
  played: string[];
  /** The move that is illegal in the current position. */
  written: string;
  /** The moves that follow `written` in the source, in order. */
  upcoming: string[];
}

interface ParsedSan {
  piece: string;
  dest: string | null;
  capture: boolean;
  hint: string;
  castle: string | null;
}

function parseSan(san: string): ParsedSan {
  const core = san.replace(/[+#!?]+$/g, '');
  if (/^O-O(-O)?$/.test(core)) return { piece: 'K', dest: null, capture: false, hint: '', castle: core };
  const m = /^([KQRBN])?([a-h]?[1-8]?)(x)?([a-h][1-8])(?:=[QRBN])?$/.exec(core);
  if (!m) return { piece: '?', dest: null, capture: false, hint: '', castle: null };
  return { piece: m[1] ?? 'P', dest: m[4], capture: !!m[3], hint: m[2] ?? '', castle: null };
}

/** How much a legal candidate resembles the written move (0 = unrelated). */
export function sanSimilarity(written: string, candidate: string): number {
  const a = parseSan(written);
  const b = parseSan(candidate);
  if (a.castle || b.castle) return a.castle && b.castle ? 4 : 0;
  if (!a.dest || !b.dest) return 0;
  let score = 0;
  if (a.piece === b.piece) score += 2;
  if (a.capture === b.capture) score += 1;
  if (a.dest === b.dest) {
    score += 3;
  } else {
    const df = Math.abs(a.dest.charCodeAt(0) - b.dest.charCodeAt(0));
    const dr = Math.abs(a.dest.charCodeAt(1) - b.dest.charCodeAt(1));
    if (df === 0 || dr === 0) score += 1;
    if (df <= 1 && dr <= 1) score += 1;
  }
  if (a.hint && a.hint === b.hint) score += 1;
  return score;
}

const strip = (san: string) => san.replace(/[!?]+$/g, '');

function tryMove(chess: Chess, san: string): string | null {
  try {
    return chess.move(strip(san)).san;
  } catch {
    return null;
  }
}

/** Plays `sans` in order; returns how many were legal and how many matched the
 *  written check/mate marks exactly (a tie-breaker: "Rd8#" must really be mate). */
function follow(fen: string, sans: string[]): { plies: number; exact: number } {
  const chess = new Chess(fen);
  let plies = 0;
  let exact = 0;
  for (const san of sans) {
    const played = tryMove(chess, san);
    if (!played) break;
    plies++;
    if (played === strip(san)) exact++;
  }
  return { plies, exact };
}

interface Candidate {
  index: number;
  written: string;
  san: string;
  plies: number;
  exact: number;
  similarity: number;
}

const MAX_BACKTRACK = 30;
const MAX_LOOKAHEAD = 40;

export function findMoveRepair(input: RepairInput): MoveRepair | null {
  const upcoming = input.upcoming.slice(0, MAX_LOOKAHEAD);
  const candidates: Candidate[] = [];

  // Position before each played ply.
  const fens: string[] = [input.startFen];
  {
    const chess = new Chess(input.startFen);
    for (const san of input.played) {
      if (!tryMove(chess, san)) return null;
      fens.push(chess.fen());
    }
  }
  const current = fens[fens.length - 1];

  // A) The written move itself is the mistake: replace it.
  for (const move of new Chess(current).moves()) {
    const similarity = sanSimilarity(input.written, move);
    if (similarity < 3) continue;
    const chess = new Chess(current);
    chess.move(move);
    const f = follow(chess.fen(), upcoming);
    const markOk = strip(input.written).replace(/^[^+#]*/, '') === move.replace(/^[^+#]*/, '');
    candidates.push({
      index: input.played.length, written: input.written, san: move,
      plies: f.plies, exact: f.exact + (markOk ? 1 : 0), similarity,
    });
  }

  // B) An EARLIER move was legal but wrong; with it fixed, the written move fits.
  const tail = [input.written, ...upcoming];
  for (let j = input.played.length - 1; j >= Math.max(0, input.played.length - MAX_BACKTRACK); j--) {
    for (const move of new Chess(fens[j]).moves()) {
      if (move === strip(input.played[j])) continue;
      const similarity = sanSimilarity(input.played[j], move);
      if (similarity < 4) continue;
      const chess = new Chess(fens[j]);
      chess.move(move);
      const between = input.played.slice(j + 1);
      const mid = follow(chess.fen(), between);
      if (mid.plies < between.length) continue;
      for (const san of between) chess.move(strip(san));
      const f = follow(chess.fen(), tail);
      if (f.plies === 0) continue; // the written move must become legal
      candidates.push({
        index: j, written: input.played[j], san: move,
        plies: f.plies - 1, exact: f.exact, similarity,
      });
    }
  }

  if (candidates.length === 0) return null;
  // Ranking. A handful of legal follow-up moves is enough evidence; beyond that
  // a LONGER run is not better evidence — it may only mean the candidate happens
  // to make a second wrong move, further on, legal ("Be2" for "Bc5" lets a later
  // misprinted "Bg4" through). So the run is capped, and resemblance to what was
  // written decides among the well-supported candidates.
  const ENOUGH = 4;
  const support = (c: Candidate) => Math.min(c.plies, ENOUGH);
  const rank = (a: Candidate, b: Candidate) =>
    support(b) - support(a) || b.similarity - a.similarity || b.exact - a.exact ||
    b.plies - a.plies || b.index - a.index;
  candidates.sort(rank);
  const best = candidates[0];

  // The continuation must back the repair: with moves still to come, at least
  // two of them (or the only one) have to be legal after it. Two, not more: a
  // second wrong move may sit only a few plies ahead.
  const needed = Math.min(upcoming.length, 2);
  if (best.plies < needed) return null;
  // Nothing follows (last move of the text): accept only a near-identical move.
  if (upcoming.length === 0 && best.similarity < 5) return null;

  // Legality alone cannot always tell two repairs apart; say so instead of
  // pretending. Two candidates for the SAME ply are separated by resemblance to
  // what was written; a repair of a DIFFERENT ply is another hypothesis about
  // where the mistake is, and resemblance cannot rank those against each other.
  const seen = new Set<number>([best.index]);
  const ties = candidates.filter((c) => {
    if (c === best || support(c) !== support(best)) return false;
    if (c.index === best.index) return c.similarity === best.similarity && c.exact === best.exact;
    if (seen.has(c.index)) return false; // only the best candidate of each other ply
    seen.add(c.index);
    return true;
  });
  return {
    index: best.index,
    written: best.written,
    san: best.san,
    confidence: ties.length === 0 ? 'high' : 'low',
    alternatives: ties.slice(0, 4).map((c) => ({ index: c.index, written: c.written, san: c.san })),
    verifiedPlies: best.plies,
  };
}
