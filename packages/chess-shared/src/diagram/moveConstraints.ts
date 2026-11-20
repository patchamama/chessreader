/**
 * Move constraints: what the moves printed after a diagram say about it.
 *
 * Every SAN move tells which piece of which side moves, where it lands and from
 * which squares it can come: "21...Txe3" is a black rook on the e-file or the
 * 3rd rank with a clear path to e3 and a white piece on e3; "22 d4" is a white
 * pawn on d2 or d3. The diagram solver uses these to fill or correct squares the
 * image reading left empty or uncertain.
 *
 * Constraints are static: they come from the SAN alone. For the first move of
 * each side they hold on the diagram itself; for later moves they hold on the
 * position reached by the earlier moves (the solver checks that by playing them).
 */

import { figurineToAscii } from '../notation/figurineToAscii.js';
import { spanishToEnglish } from '../notation/spanishToEnglish.js';
import { tokenize } from '../notation/sanTokenizer.js';

export type PieceType = 'p' | 'n' | 'b' | 'r' | 'q' | 'k';
export type Side = 'w' | 'b';

export interface FollowingMove {
  /** English SAN. */
  san: string;
  /** As printed ("Txe3", "♘f3"). */
  written: string;
  moveNumber: number;
  color: Side;
  /** Offsets into the text given. */
  charStart: number;
  charEnd: number;
}

export interface FollowingMoves {
  sideToMove: Side;
  moveNumber: number;
  moves: FollowingMove[];
}

/** A piece the position must hold before the move. `piece: null`: any piece of that colour. */
export interface RequiredPiece {
  square: string;
  color: Side;
  piece: PieceType | null;
}

export interface MoveConstraint {
  index: number;
  moveNumber: number;
  color: Side;
  san: string;
  written: string;
  piece: PieceType;
  /** Destination (the king's for castling). */
  to: string;
  /** Possible origin squares, the most likely first. A slider also needs `squaresBetween(from, to)` clear. */
  from: string[];
  /** The destination holds an enemy piece (unless the capture is en passant). */
  capture: boolean;
  /** A pawn capture to the 6th (white) / 3rd (black) rank: may be en passant. */
  enPassant: boolean;
  promotion?: PieceType;
  castle?: 'O-O' | 'O-O-O';
  requires: RequiredPiece[];
  /** Squares that must be empty (castling path; a non-capture destination). */
  mustBeEmpty: string[];
}

const FILES = 'abcdefgh';
const sq = (f: number, r: number) => `${FILES[f]}${r + 1}`;
const fileOf = (s: string) => FILES.indexOf(s[0]);
const rankOf = (s: string) => Number(s[1]) - 1;
const onBoard = (f: number, r: number) => f >= 0 && f < 8 && r >= 0 && r < 8;

/** The squares strictly between two squares on a line (rank, file, diagonal); empty otherwise. */
export function squaresBetween(a: string, b: string): string[] {
  const df = fileOf(b) - fileOf(a);
  const dr = rankOf(b) - rankOf(a);
  if (!(df === 0 || dr === 0 || Math.abs(df) === Math.abs(dr))) return [];
  const n = Math.max(Math.abs(df), Math.abs(dr));
  const out: string[] = [];
  for (let i = 1; i < n; i++) out.push(sq(fileOf(a) + (Math.sign(df) * i), rankOf(a) + (Math.sign(dr) * i)));
  return out;
}

const KNIGHT = [[1, 2], [2, 1], [2, -1], [1, -2], [-1, -2], [-2, -1], [-2, 1], [-1, 2]];
const KING = [[1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1]];
const ROOK_DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const BISHOP_DIRS = [[1, 1], [1, -1], [-1, 1], [-1, -1]];

function pieceOrigins(piece: PieceType, to: string): string[] {
  const f = fileOf(to);
  const r = rankOf(to);
  const out: string[] = [];
  const steps = (dirs: number[][]) => {
    for (const [a, b] of dirs) if (onBoard(f + a, r + b)) out.push(sq(f + a, r + b));
  };
  const rays = (dirs: number[][]) => {
    for (const [a, b] of dirs) for (let i = 1; onBoard(f + (a * i), r + (b * i)); i++) out.push(sq(f + (a * i), r + (b * i)));
  };
  if (piece === 'n') steps(KNIGHT);
  else if (piece === 'k') steps(KING);
  else {
    if (piece === 'r' || piece === 'q') rays(ROOK_DIRS);
    if (piece === 'b' || piece === 'q') rays(BISHOP_DIRS);
  }
  // Nearest first (a short move is the more likely one), then by name: deterministic.
  const dist = (s: string) => Math.max(Math.abs(fileOf(s) - f), Math.abs(rankOf(s) - r));
  return out.sort((x, y) => dist(x) - dist(y) || x.localeCompare(y));
}

const SAN_RE = /^([KQRBN])?([a-h])?([1-8])?(x)?([a-h][1-8])(?:=?([QRBN]))?$/;

/** The constraint a SAN move (English) by `color` puts on the position before it; null if it is no move. */
export function sanConstraint(san: string, color: Side): Omit<MoveConstraint, 'index' | 'moveNumber' | 'written'> | null {
  const core = san.replace(/[+#!?]+$/g, '').replace(/^0-0-0$/, 'O-O-O').replace(/^0-0$/, 'O-O');
  const home = color === 'w' ? 0 : 7;
  if (core === 'O-O' || core === 'O-O-O') {
    const long = core === 'O-O-O';
    const king = sq(4, home);
    const rook = sq(long ? 0 : 7, home);
    return {
      color, san, piece: 'k', to: sq(long ? 2 : 6, home), from: [king], capture: false, enPassant: false, castle: core,
      requires: [{ square: king, color, piece: 'k' }, { square: rook, color, piece: 'r' }],
      mustBeEmpty: squaresBetween(king, rook),
    };
  }
  const m = SAN_RE.exec(core);
  if (!m) return null;
  const piece = (m[1]?.toLowerCase() ?? 'p') as PieceType;
  const [, , hintFile, hintRank, x, to, promo] = m;
  const capture = !!x;
  const enemy: Side = color === 'w' ? 'b' : 'w';
  const forward = color === 'w' ? 1 : -1;
  let from: string[];
  let enPassant = false;
  if (piece === 'p') {
    const f = fileOf(to);
    const r = rankOf(to);
    if (capture) {
      const files = hintFile ? [fileOf(`${hintFile}1`)] : [f - 1, f + 1];
      from = files.filter((ff) => Math.abs(ff - f) === 1 && onBoard(ff, r - forward)).map((ff) => sq(ff, r - forward));
      enPassant = r === (color === 'w' ? 5 : 2);
    } else {
      from = onBoard(f, r - forward) ? [sq(f, r - forward)] : [];
      // A double step from the home rank: listed first, pawns are more often still at home.
      if (r === (color === 'w' ? 3 : 4)) from.unshift(sq(f, r - (2 * forward)));
    }
  } else {
    from = pieceOrigins(piece, to)
      .filter((s) => (!hintFile || s[0] === hintFile) && (!hintRank || s[1] === hintRank));
  }
  if (from.length === 0) return null;
  const requires: RequiredPiece[] = capture && !enPassant ? [{ square: to, color: enemy, piece: null }] : [];
  return {
    color, san, piece, to, from, capture, enPassant,
    ...(promo ? { promotion: promo.toLowerCase() as PieceType } : {}),
    requires,
    mustBeEmpty: capture ? [] : [to],
  };
}

/**
 * The main line printed after a diagram: from the first numbered move on, the
 * paragraphs that go on with the next move number (as the reader's main-line
 * pass does). A paragraph led by another number, or by prose, is a remark or an
 * alternative ("En caso de 62.f5, 62...Rxf5 …") and is skipped, as are moves in
 * brackets and moves named in prose. A FEN, a diagram or a result ends it.
 */
export function parseFollowingMoves(text: string): FollowingMoves | null {
  const normalised = spanishToEnglish(figurineToAscii(text));
  const tokens = tokenize(normalised);
  let depth = 0;
  let expNumber = 0;
  let expColor: Side = 'w';
  let started = false;
  /** Whether the current paragraph goes on with the main line (null: not decided yet). */
  let inLine: boolean | null = null;
  const moves: FollowingMove[] = [];
  const result = (): FollowingMoves | null =>
    moves.length ? { sideToMove: moves[0].color, moveNumber: moves[0].moveNumber, moves } : null;
  for (const t of tokens) {
    if (t.type === 'variation-open') { depth++; continue; }
    if (t.type === 'variation-close') { depth = Math.max(0, depth - 1); continue; }
    if (depth > 0) continue;
    if (t.type === 'fen' || t.type === 'diagram' || t.type === 'result') {
      if (started) return result();
      continue;
    }
    if (t.type === 'paragraph-break') { inLine = null; continue; }
    if (t.type === 'move-number') {
      const color: Side = t.isEllipsis ? 'b' : 'w';
      if (!started) {
        started = true;
        expNumber = t.moveNumber!;
        expColor = color;
        inLine = true;
      } else {
        const fits = t.moveNumber === expNumber && color === expColor;
        if (inLine === null) inLine = fits && !!t.atParagraphStart;
        else if (!fits) inLine = false;
      }
      continue;
    }
    if (t.type !== 'move' || t.isolated || !started || inLine !== true) continue;
    moves.push({
      san: t.san!, written: text.slice(t.charStart, t.charEnd),
      moveNumber: expNumber, color: expColor, charStart: t.charStart, charEnd: t.charEnd,
    });
    if (expColor === 'w') expColor = 'b';
    else { expColor = 'w'; expNumber++; }
  }
  return result();
}

/** The constraints of every move printed after a diagram (see `parseFollowingMoves`). */
export function moveConstraints(text: string): (FollowingMoves & { constraints: MoveConstraint[] }) | null {
  const parsed = parseFollowingMoves(text);
  if (!parsed) return null;
  const constraints: MoveConstraint[] = [];
  parsed.moves.forEach((m, index) => {
    const c = sanConstraint(m.san, m.color);
    if (c) constraints.push({ ...c, index, moveNumber: m.moveNumber, written: m.written });
  });
  return { ...parsed, constraints };
}
