/**
 * Wrong-move finder: where a printed game stops playing and which single fix
 * makes the most of the rest of it play again.
 *
 * Recognition of a printed game works up to a point and then stops: a move is
 * illegal. The mistake is at that ply or a few plies before it (a legal but
 * wrong move only shows later). Each hypothesis is one edit of the printed main
 * line, scored by how many later printed moves then play legally:
 *  - substitute: a legal move that looks like the printed one (same piece,
 *    destination file or rank: `sanSimilarity` of moveRepair), or one OCR
 *    confusion away (6/b, 1/l, c/e, 5/s, 0/o, 8/3 …), also read in Spanish
 *    letters (C, A, T, D, R);
 *  - delete: the printed move is spurious (a duplicated token);
 *  - insert: a move is missing before the failing one (any legal move);
 *  - swap: two consecutive printed moves are in the wrong order.
 * Ranking: printed moves accounted for (kept + fixed + playedAfter, desc), then
 * playedAfter (a fix the continuation backs beats one at the end of the game),
 * then resemblance, then the later ply. The LLM, if
 * any, only re-ranks these candidates against the printed text.
 *
 * Complexity: (BACKTRACK plies x similar legal moves + legal moves at the
 * failing ply + 3) replays of at most the remaining M moves: O((B*S + L) * M).
 */

import { Chess } from 'chess.js';
import { figurineToAscii } from '../notation/figurineToAscii.js';
import { spanishTokenToEnglish } from '../notation/spanishToEnglish.js';
import { sanSimilarity } from './moveRepair.js';

export type WrongMoveFixKind = 'substitute' | 'delete' | 'insert' | 'swap';

export interface WrongMoveFix {
  /** 0-based index in the printed list where the fix applies (insert: the move goes before it). */
  ply: number;
  kind: WrongMoveFixKind;
  /** The printed move(s) ("Bb5 Nc6" for a swap; '' for an insert). */
  from: string;
  /** The fixed move(s) ('' for a delete). */
  to: string;
  /** How many printed moves after the fixed one(s) then play legally. */
  playedAfter: number;
  /** All the printed moves play after the fix. */
  complete: boolean;
}

export interface WrongMoveInput {
  /** The printed main line, as SAN (English, Spanish letters or figurines). */
  sans: string[];
  startFen: string;
  topN?: number;
}

export interface WrongMoveResult {
  /** The first printed ply that does not play (null: the whole game plays). */
  failingPly: number | null;
  fixes: WrongMoveFix[];
}

const BACKTRACK = 12;
const MIN_SIMILARITY = 3;

const clean = (token: string) =>
  figurineToAscii(token.trim()).replace(/[!?]+$/g, '').replace(/^0-0-0/, 'O-O-O').replace(/^0-0/, 'O-O');

/**
 * Printed tokens → English SAN. A list led by Spanish letters (C, A, T, D and no
 * N, B, Q) is Spanish throughout (R = king); otherwise a token led by C, A, T or
 * D alone is read as Spanish (R stays a rook).
 */
function normaliseAll(tokens: string[]): string[] {
  const cleaned = tokens.map(clean);
  const spanish = cleaned.some((t) => /^[CATD]/.test(t)) && !cleaned.some((t) => /^[NBQ]/.test(t));
  return cleaned.map((t) => (spanish || /^[CATD]/.test(t) ? spanishTokenToEnglish(t) : t));
}

function tryMove(chess: Chess, san: string): boolean {
  try { chess.move(san); return true; } catch { return false; }
}

/** How many of `sans` play in order from `chess` (mutates it). */
function follow(chess: Chess, sans: string[]): number {
  let n = 0;
  for (const san of sans) { if (!tryMove(chess, san)) break; n++; }
  return n;
}

// Characters an OCR confuses (both directions).
const CONFUSIONS: Array<[string, string]> = [
  ['6', 'b'], ['1', 'l'], ['1', 'i'], ['c', 'e'], ['5', 's'], ['0', 'o'], ['0', 'O'], ['8', '3'], ['8', 'B'],
  ['g', '9'], ['h', 'b'], ['f', 't'], ['2', 'z'], ['4', 'a'], ['x', 'X'], ['n', 'h'],
];
const confusable = (a: string, b: string) => CONFUSIONS.some(([x, y]) => (a === x && b === y) || (a === y && b === x));

/** Edit distance where an OCR confusion costs 0.4 and any other change 1. */
function ocrDistance(a: string, b: string): number {
  const d: number[][] = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const sub = a[i - 1] === b[j - 1] ? 0 : confusable(a[i - 1], b[j - 1]) ? 0.4 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + sub);
    }
  }
  return d[a.length][b.length];
}

const TO_SPANISH: Record<string, string> = { N: 'C', B: 'A', R: 'T', Q: 'D', K: 'R' };

/** Resemblance of a legal candidate to a printed token, on the sanSimilarity scale (0..8). */
export function printedSimilarity(printed: string, candidate: string): number {
  const raw = figurineToAscii(printed.trim()).replace(/[+#!?]+$/g, '');
  const cand = candidate.replace(/[+#]+$/g, '');
  const spanish = cand.replace(/^[NBRQK]/, (p) => TO_SPANISH[p]);
  const ocr = Math.min(ocrDistance(raw, cand), ocrDistance(raw, spanish));
  const byOcr = ocr === 0 ? 8 : ocr <= 0.4 ? 7 : ocr <= 1 ? 5 : ocr <= 1.4 ? 4 : 0;
  return Math.max(sanSimilarity(normaliseAll([printed])[0], cand), byOcr);
}

/** `reach`: printed moves accounted for (kept, fixed and played after): the evidence. */
interface Scored extends WrongMoveFix { similarity: number; reach: number }

/**
 * The first printed ply that does not play from `startFen`, and the ranked
 * single-edit fixes of the printed list around it.
 */
export function findWrongMove(input: WrongMoveInput): WrongMoveResult {
  const topN = input.topN ?? 5;
  const printed = input.sans;
  const sans = normaliseAll(printed);
  const fens: string[] = [input.startFen];
  const chess = new Chess(input.startFen);
  let failing = -1;
  for (let i = 0; i < sans.length; i++) {
    if (!tryMove(chess, sans[i])) { failing = i; break; }
    fens.push(chess.fen());
  }
  if (failing < 0) return { failingPly: null, fixes: [] };

  const out: Scored[] = [];
  const total = sans.length;
  const push = (fix: Omit<Scored, 'complete' | 'reach'>, fixedEnd: number) =>
    out.push({ ...fix, complete: fix.playedAfter === total - fixedEnd, reach: fixedEnd + fix.playedAfter });
  const from = (fen: string, list: string[]) => follow(new Chess(fen), list);

  // Substitute: the failing ply or an earlier, legal-but-wrong one.
  for (let j = failing; j >= Math.max(0, failing - BACKTRACK); j--) {
    for (const move of new Chess(fens[j]).moves()) {
      if (j < failing && move.replace(/[+#]$/, '') === sans[j].replace(/[+#]$/, '')) continue;
      const similarity = printedSimilarity(printed[j], move);
      if (similarity < MIN_SIMILARITY) continue;
      const c = new Chess(fens[j]);
      c.move(move);
      const played = follow(c, sans.slice(j + 1));
      // An earlier fix must at least get past the ply that failed.
      if (j < failing && j + 1 + played <= failing) continue;
      push({ ply: j, kind: 'substitute', from: printed[j], to: move, playedAfter: played, similarity }, j + 1);
    }
  }
  // Delete the failing move, or the one before it.
  for (const j of [failing, failing - 1]) {
    // Deleting either copy of a duplicated move is the same fix: keep the later.
    if (j < 0 || (j < failing && printed[j] === printed[failing])) continue;
    push({ ply: j, kind: 'delete', from: printed[j], to: '', playedAfter: from(fens[j], sans.slice(j + 1)), similarity: 2 }, j + 1);
  }
  // Insert one move before the failing one.
  for (const move of new Chess(fens[failing]).moves()) {
    const c = new Chess(fens[failing]);
    c.move(move);
    const played = follow(c, sans.slice(failing));
    if (played === 0) continue;
    push({ ply: failing, kind: 'insert', from: '', to: move, playedAfter: played, similarity: 1 }, failing);
  }
  // Swap two consecutive moves around the failing ply.
  for (const j of [failing - 1, failing]) {
    if (j < 0 || j + 1 >= total) continue;
    const c = new Chess(fens[j]);
    if (!tryMove(c, sans[j + 1]) || !tryMove(c, sans[j])) continue;
    push({
      ply: j, kind: 'swap', from: `${printed[j]} ${printed[j + 1]}`, to: `${sans[j + 1]} ${sans[j]}`,
      playedAfter: follow(c, sans.slice(j + 2)), similarity: 3,
    }, j + 2);
  }

  out.sort((a, b) => b.reach - a.reach || b.playedAfter - a.playedAfter || Number(b.complete) - Number(a.complete) ||
    b.similarity - a.similarity || b.ply - a.ply || a.to.localeCompare(b.to));
  const fixes = out.slice(0, topN).map(({ similarity: _s, reach: _r, ...fix }) => fix);
  return { failingPly: failing, fixes };
}
