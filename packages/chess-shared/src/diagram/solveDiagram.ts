/**
 * Diagram solver: the position of a diagram from uncertain square readings plus
 * the moves printed after it.
 *
 * Inputs are candidate readings per square (`{square, piece, confidence}`, maybe
 * several per square) from any reader: per-book templates, an LLM vision model,
 * or none at all. The moves that follow the diagram are the evidence: the right
 * position is a legal one from which most of them can be played, and among
 * those the one closest to the readings.
 *
 * Search (deterministic beam search over edits):
 *  - start from the most confident reading per square, made legal (one king per
 *    side, no pawn on the 1st/8th rank);
 *  - a state is scored by (moves played from it, desc; reading cost, asc). The
 *    cost of a square is (top confidence - confidence of the chosen value), plus
 *    UNREAD_COST when the chosen value is no reading at all;
 *  - expanding a state looks at the first move that fails and proposes edits on
 *    squares no earlier move touched: put the required piece on each possible
 *    origin (with its path cleared and the destination fixed: an enemy piece to
 *    capture, an empty square to move to), the castling king and rook, or any
 *    other reading of a square;
 *  - a missing king is placed on the usual square that lets most moves play.
 *
 * Complexity: at most maxEdits rounds (default max(12, 2M), capped at 80) x beamWidth (10) states x E edits (E <= ~45:
 * the origins of the failing move plus MAX_ALTERNATIVES other readings), each
 * evaluated by replaying at most the M following moves: O(maxEdits * beamWidth
 * * E * M) chess.js moves, about 2M * 10 * 45 * M; a missing king adds up to
 * KING_TRIES replays once per state. The final top candidates are re-scored
 * through recognizeGames, the reader's own engine (`recognisedMoves`).
 */

import { Chess } from 'chess.js';
import { recognizeGames } from '../recognition/recognizeGames.js';
import { moveConstraints, squaresBetween, type MoveConstraint, type Side } from './moveConstraints.js';

export interface SquareReading {
  square: string;
  /** FEN letter ("K", "p") or null for an empty square. */
  piece: string | null;
  confidence: number;
}

export interface ChangedSquare {
  square: string;
  /** The most confident reading (null: empty, or no reading). */
  reading: string | null;
  /** What the solution puts there. */
  piece: string | null;
}

export interface DiagramSolution {
  fen: string;
  /** Following main-line moves that play from the FEN, in order. */
  playedMoves: number;
  /** The same, counted by the reader's recogniser (recognizeGames on the FEN + text). */
  recognisedMoves: number;
  totalMoves: number;
  changedSquares: ChangedSquare[];
  /** playedMoves + 0.5 * recognisedMoves / (totalMoves + 1) + 0.5 / (1 + cost): moves first,
   *  then the reader's agreement, then agreement with the readings (cost: see the header). */
  score: number;
}

export interface SolveOptions {
  topN?: number;
  beamWidth?: number;
  maxEdits?: number;
}

const UNREAD_COST = 0.3;
const MAX_ALTERNATIVES = 16;
const KING_TRIES = 8;
const PRIOR_STEP = 0.001;
const FILES = 'abcdefgh';

const idx = (s: string) => FILES.indexOf(s[0]) + ((Number(s[1]) - 1) * 8);
const name = (i: number) => `${FILES[i % 8]}${Math.floor(i / 8) + 1}`;
const colorOf = (p: string): Side => (p === p.toUpperCase() ? 'w' : 'b');
const letter = (type: string, color: Side) => (color === 'w' ? type.toUpperCase() : type.toLowerCase());

type Board = Array<string | null>;

/** One reading per square of a FEN (empty squares as null), all with the same confidence. */
export function readingFromFen(fen: string, confidence = 1): SquareReading[] {
  const out: SquareReading[] = [];
  fen.split(' ')[0].split('/').forEach((row, k) => {
    const rank = 8 - k;
    let file = 0;
    for (const ch of row) {
      if (/\d/.test(ch)) {
        for (let n = 0; n < Number(ch); n++) out.push({ square: `${FILES[file++]}${rank}`, piece: null, confidence });
      } else out.push({ square: `${FILES[file++]}${rank}`, piece: ch, confidence });
    }
  });
  return out;
}

function boardFen(board: Board, side: Side, moveNumber: number): string {
  const rows: string[] = [];
  for (let r = 7; r >= 0; r--) {
    let row = '';
    let empty = 0;
    for (let f = 0; f < 8; f++) {
      const p = board[(r * 8) + f];
      if (!p) empty++;
      else { if (empty) row += empty; empty = 0; row += p; }
    }
    if (empty) row += empty;
    rows.push(row);
  }
  const at = (s: string) => board[idx(s)];
  let castling = '';
  if (at('e1') === 'K' && at('h1') === 'R') castling += 'K';
  if (at('e1') === 'K' && at('a1') === 'R') castling += 'Q';
  if (at('e8') === 'k' && at('h8') === 'r') castling += 'k';
  if (at('e8') === 'k' && at('a8') === 'r') castling += 'q';
  return `${rows.join('/')} ${side} ${castling || '-'} - 0 ${moveNumber}`;
}

/** Per square, the readings merged (highest confidence per value), best first. */
type Candidates = Array<Array<{ piece: string | null; conf: number }>>;

function candidatesFrom(readings: SquareReading[]): Candidates {
  const out: Candidates = Array.from({ length: 64 }, () => []);
  for (const r of readings) {
    if (!/^[a-h][1-8]$/.test(r.square)) continue;
    const list = out[idx(r.square)];
    const piece = r.piece && /^[pnbrqkPNBRQK]$/.test(r.piece) ? r.piece : null;
    const seen = list.find((c) => c.piece === piece);
    if (seen) seen.conf = Math.max(seen.conf, r.confidence);
    else list.push({ piece, conf: r.confidence });
  }
  for (const list of out) list.sort((a, b) => b.conf - a.conf || String(a.piece).localeCompare(String(b.piece)));
  return out;
}

function squareCost(cands: Candidates, i: number, value: string | null): number {
  const list = cands[i];
  const top = list[0]?.conf ?? 0;
  const hit = list.find((c) => c.piece === value);
  if (hit) return top - hit.conf;
  // No reading at all: an empty square is the default.
  if (list.length === 0 && value === null) return 0;
  return top + UNREAD_COST;
}

const boardCost = (cands: Candidates, board: Board) => board.reduce((s, v, i) => s + squareCost(cands, i, v), 0);

/** The most confident reading per square, made legal: one king per side, no pawn on a back rank. */
function initialBoard(cands: Candidates): Board {
  const board: Board = cands.map((list) => list[0]?.piece ?? null);
  const next = (i: number, bad: (p: string) => boolean) => cands[i].find((c) => c.piece === null || !bad(c.piece))?.piece ?? null;
  for (let i = 0; i < 64; i++) {
    const p = board[i];
    if (p && p.toLowerCase() === 'p' && (i < 8 || i >= 56)) board[i] = next(i, (q) => q.toLowerCase() === 'p');
  }
  for (const king of ['K', 'k']) {
    const at = board.map((p, i) => (p === king ? i : -1)).filter((i) => i >= 0);
    if (at.length < 2) continue;
    const conf = (i: number) => cands[i].find((c) => c.piece === king)?.conf ?? 0;
    at.sort((a, b) => conf(b) - conf(a) || a - b);
    for (const i of at.slice(1)) board[i] = next(i, (q) => q === king || (q.toLowerCase() === 'p' && (i < 8 || i >= 56)));
  }
  return board;
}

interface Evaluation {
  /** -1: the position is not legal. */
  played: number;
  /** The board with any missing king placed. */
  board: Board;
  fen: string;
  /** Squares the played moves moved from or to. */
  touched: Set<number>;
  /** Squares a played slider passed over: a piece put there would block it. */
  passed: Set<number>;
  /** The position before the failing move. */
  position: Board;
}

function isLegalSetup(board: Board, side: Side): boolean {
  if (board.filter((p) => p === 'K').length !== 1 || board.filter((p) => p === 'k').length !== 1) return false;
  for (let i = 0; i < 64; i++) if ((i < 8 || i >= 56) && board[i]?.toLowerCase() === 'p') return false;
  try {
    // The side NOT to move must not be in check.
    const other = new Chess(boardFen(board, side === 'w' ? 'b' : 'w', 1), { skipValidation: true });
    return !other.inCheck();
  } catch { return false; }
}

function replay(board: Board, side: Side, moveNumber: number, sans: string[]): Evaluation {
  const fen = boardFen(board, side, moveNumber);
  const touched = new Set<number>();
  const passed = new Set<number>();
  const illegal = { played: -1, board, fen, touched, passed, position: board };
  if (!isLegalSetup(board, side)) return illegal;
  let chess: Chess;
  try { chess = new Chess(fen, { skipValidation: true }); } catch { return illegal; }
  let played = 0;
  for (const san of sans) {
    let mv;
    try { mv = chess.move(san.replace(/[!?]+$/g, '')); } catch { break; }
    touched.add(idx(mv.from)).add(idx(mv.to));
    if (mv.piece !== 'n') for (const q of squaresBetween(mv.from, mv.to)) passed.add(idx(q));
    if (mv.flags.includes('k')) touched.add(idx(`h${mv.from[1]}`)).add(idx(`f${mv.from[1]}`));
    if (mv.flags.includes('q')) touched.add(idx(`a${mv.from[1]}`)).add(idx(`d${mv.from[1]}`));
    if (mv.flags.includes('e')) touched.add(idx(`${mv.to[0]}${mv.from[1]}`));
    played++;
  }
  const position: Board = Array(64).fill(null);
  for (const row of chess.board()) for (const p of row) if (p) position[idx(p.square)] = letter(p.type, p.color);
  return { played, board, fen, touched, passed, position };
}

const KING_HOME: Record<Side, string[]> = {
  w: ['g1', 'h1', 'f1', 'e1', 'c1', 'b1', 'a1', 'h2', 'g2', 'd1', 'f2', 'e2'],
  b: ['g8', 'h8', 'f8', 'e8', 'c8', 'b8', 'a8', 'h7', 'g7', 'd8', 'f7', 'e7'],
};

/** Evaluates a board; a missing king goes on the usual square that lets most moves play. */
function evaluate(board: Board, side: Side, moveNumber: number, sans: string[]): Evaluation {
  let b = board;
  for (const s of ['w', 'b'] as Side[]) {
    const king = letter('k', s);
    if (b.includes(king)) continue;
    const homes = [...KING_HOME[s], ...Array.from({ length: 64 }, (_, i) => name(i))]
      .filter((q, k, all) => all.indexOf(q) === k && !b[idx(q)]).slice(0, KING_TRIES);
    let best: Evaluation | null = null;
    for (const home of homes) {
      const trial = b.slice();
      trial[idx(home)] = king;
      // The other king, if missing too, is judged later: place it provisionally.
      const e = replay(withProvisionalKings(trial), side, moveNumber, sans);
      if (!best || e.played > best.played) best = { ...e, board: trial };
    }
    if (best) b = best.board;
  }
  return replay(b, side, moveNumber, sans);
}

function withProvisionalKings(board: Board): Board {
  const b = board.slice();
  for (const s of ['w', 'b'] as Side[]) {
    const king = letter('k', s);
    if (b.includes(king)) continue;
    const home = KING_HOME[s].find((q) => !b[idx(q)]);
    if (home) b[idx(home)] = king;
  }
  return b;
}

/** Edits that may make the failing move playable (or the position legal). */
/** An edit and its prior: a small extra cost by the rank of the origin used (nearest first), so
 *  equally cheap hypotheses are explored in the order of the constraint, not of the board. */
interface Edit { board: Board; bias: number }

function edits(board: Board, ev: Evaluation, c: MoveConstraint | undefined, cands: Candidates): Edit[] {
  const out: Edit[] = [];
  const free = (i: number) => !ev.touched.has(i);
  const pos = ev.position;
  // A piece may go on an empty square only where no earlier move passed.
  const placeable = (i: number) => free(i) && (!!pos[i] || !ev.passed.has(i));
  if (c && ev.played >= 0) {
    if (c.castle) {
      const e = board.slice();
      let ok = true;
      for (const r of c.requires) {
        const i = idx(r.square);
        if (pos[i] === letter(r.piece!, c.color)) continue;
        if (!placeable(i)) ok = false;
        // A king placed elsewhere goes: one king per side.
        if (r.piece === 'k') for (let k = 0; k < 64; k++) if (e[k] === letter('k', c.color) && free(k)) e[k] = null;
        e[idx(r.square)] = letter(r.piece!, c.color);
      }
      for (const s of c.mustBeEmpty) { const i = idx(s); if (pos[i]) { if (!free(i)) ok = false; e[i] = null; } }
      if (ok) out.push({ board: e, bias: 0 });
    } else {
      const want = letter(c.piece, c.color);
      const to = idx(c.to);
      c.from.forEach((o, rank) => {
        const i = idx(o);
        if (pos[i] !== want && !placeable(i)) return;
        const e = board.slice();
        let ok = true;
        if (pos[i] !== want) {
          if (c.piece === 'k') for (let k = 0; k < 64; k++) if (e[k] === want && free(k)) e[k] = null;
          e[i] = want;
        }
        const path = c.piece === 'n' || c.piece === 'k' ? [] : squaresBetween(o, c.to);
        for (const s of path) { const j = idx(s); if (pos[j]) { if (!free(j)) ok = false; e[j] = null; } }
        const enemy: Side = c.color === 'w' ? 'b' : 'w';
        if (c.capture && !c.enPassant) {
          const there = pos[to];
          if (!there || colorOf(there) !== enemy || there.toLowerCase() === 'k') {
            if (!placeable(to)) ok = false;
            const alt = cands[to].find((x) => x.piece && colorOf(x.piece) === enemy && x.piece.toLowerCase() !== 'k')?.piece;
            e[to] = alt ?? letter(to < 8 || to >= 56 ? 'n' : 'p', enemy);
          }
        } else if (!c.capture && pos[to]) {
          if (!free(to)) ok = false;
          e[to] = null;
        }
        if (ok && e.some((v, k) => v !== board[k])) out.push({ board: e, bias: PRIOR_STEP * rank });
      });
    }
  }
  // Any other reading of an untouched square (a misread piece, a pin, a check).
  const alts: Array<{ e: Board; cost: number }> = [];
  for (let i = 0; i < 64; i++) {
    if (!free(i)) continue;
    for (const cand of cands[i]) {
      if (cand.piece === board[i] || (cand.piece && !placeable(i))) continue;
      if (cand.piece?.toLowerCase() === 'p' && (i < 8 || i >= 56)) continue;
      const e = board.slice();
      if (cand.piece?.toLowerCase() === 'k') for (let k = 0; k < 64; k++) if (e[k] === cand.piece) e[k] = null;
      e[i] = cand.piece;
      alts.push({ e, cost: squareCost(cands, i, cand.piece) - squareCost(cands, i, board[i]) });
    }
  }
  alts.sort((a, b) => a.cost - b.cost);
  for (const a of alts.slice(0, MAX_ALTERNATIVES)) out.push({ board: a.e, bias: 0 });
  return out;
}

interface State { board: Board; ev: Evaluation; cost: number; bias: number; key: string }

const better = (a: State, b: State) =>
  b.ev.played - a.ev.played || (a.cost + a.bias) - (b.cost + b.bias) || a.key.localeCompare(b.key);

/** The fragment's main line from this FEN, through the reader's own recognition. */
function recognisedPlies(fen: string, text: string): number {
  try {
    const game = recognizeGames(`${fen}\n${text}`).find((g) => g.tree.startFen === fen);
    return game ? game.tree.mainline.length : 0;
  } catch { return 0; }
}

/**
 * The legal positions, ranked, that best explain the readings and the moves
 * printed after the diagram (`followingText`: the text up to the next diagram).
 */
export function solveDiagram(readings: SquareReading[], followingText: string, options: SolveOptions = {}): DiagramSolution[] {
  const topN = options.topN ?? 3;
  const beamWidth = options.beamWidth ?? 10;
  const parsed = moveConstraints(followingText);
  const side: Side = parsed?.sideToMove ?? 'w';
  const moveNumber = parsed?.moveNumber ?? 1;
  const sans = parsed?.moves.map((m) => m.san) ?? [];
  // Each round fixes one move: a long continuation may need a piece per move.
  const maxEdits = options.maxEdits ?? Math.min(80, Math.max(12, 2 * sans.length));
  const constraints = new Map(parsed?.constraints.map((c) => [c.index, c]) ?? []);
  const cands = candidatesFrom(readings);

  const make = (board: Board, bias: number): State => {
    const ev = evaluate(board, side, moveNumber, sans);
    return { board: ev.board, ev, cost: boardCost(cands, ev.board), bias, key: ev.board.map((p) => p ?? '.').join('') };
  };
  const seen = new Map<string, State>();
  const add = (s: State) => { if (!seen.has(s.key)) seen.set(s.key, s); return seen.get(s.key)!; };

  let beam = [add(make(initialBoard(cands), 0))];
  for (let round = 0; round < maxEdits; round++) {
    if (beam[0].ev.played === sans.length && sans.length > 0) break;
    const next = new Map<string, State>(beam.map((s) => [s.key, s]));
    for (const s of beam) {
      if (s.ev.played === sans.length) continue;
      for (const e of edits(s.board, s.ev, constraints.get(Math.max(0, s.ev.played)), cands)) {
        const key = e.board.map((p) => p ?? '.').join('');
        if (next.has(key)) continue;
        const child = seen.get(key) ?? add(make(e.board, s.bias + e.bias));
        next.set(child.key, child);
      }
    }
    const ranked = [...next.values()].sort(better).slice(0, beamWidth);
    if (ranked.every((s, k) => s.key === beam[k]?.key)) break;
    beam = ranked;
  }

  const pool = [...seen.values()].filter((s) => s.ev.played >= 0).sort(better).slice(0, topN * 3);
  const top = cands.map((list) => list[0]?.piece ?? null);
  const solutions = pool.map((s) => {
    const changedSquares: ChangedSquare[] = [];
    s.board.forEach((p, i) => { if (p !== top[i]) changedSquares.push({ square: name(i), reading: top[i], piece: p }); });
    return {
      fen: s.ev.fen, playedMoves: s.ev.played, recognisedMoves: recognisedPlies(s.ev.fen, followingText),
      totalMoves: sans.length, changedSquares, score: 0, cost: s.cost,
    };
  });
  for (const x of solutions) {
    x.score = x.playedMoves + (0.5 * x.recognisedMoves / (x.totalMoves + 1)) + (0.5 / (1 + x.cost));
  }
  solutions.sort((a, b) => b.score - a.score || a.fen.localeCompare(b.fen));
  return solutions.slice(0, topN).map(({ cost: _cost, ...rest }) => rest);
}
