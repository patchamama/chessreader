import { Chess } from 'chess.js';

/**
 * Positions a book describes in prose instead of printing a FEN:
 *   "En la posición ♖e1, ♗e4 (blancas) - ♔g8, ♘c6, ♗b3, peón f7, g7, h7 (negras), Diagrama 197."
 *   "the position Kb1, Rb3, Nd2, pawn f3 (White) - Kh8, Bf6, Nb6, pawns a7, a5, etc. (Black)."
 * Each side is a list of pieces (figurines or piece letters) and pawns (bare
 * squares, usually after "peón"/"peones"/"pawns"), closed by the side's name.
 */

export interface ProsePosition {
  /** Offset of the first piece of the white list. */
  charStart: number;
  /** Exclusive offset right after the black side's name. */
  charEnd: number;
  /** Piece placement by square ("e1" → "R", "g8" → "k"); kings may be missing. */
  pieces: Map<string, string>;
}

const FIGURINE: Record<string, string> = {
  '♔': 'k', '♚': 'k', '♕': 'q', '♛': 'q', '♖': 'r', '♜': 'r', '♗': 'b', '♝': 'b', '♘': 'n', '♞': 'n', '♙': 'p', '♟': 'p',
};
// Spanish books write R for the king (Rey) and T for the rook (Torre).
const LETTERS_ES: Record<string, string> = { R: 'k', D: 'q', T: 'r', A: 'b', C: 'n', P: 'p' };
const LETTERS_EN: Record<string, string> = { K: 'k', Q: 'q', R: 'r', B: 'b', N: 'n', P: 'p' };

const ITEM_RE = /(?<![\wÀ-ɏ])([♔♕♖♗♘♙♚♛♜♝♞♟]|[KQRBNDTACP](?=[a-h][1-8]))?([a-h][1-8])(?![\wÀ-ɏ])/gu;
// Words that may join two items of a list: "♗e4, peón f7, g7 y h7", "pawns on a7, a5 and b4".
const JOINERS = new Set(['y', 'e', 'and', 'peón', 'peon', 'peones', 'pawn', 'pawns', 'en', 'on', 'at', 'etc', 'etc.']);
const SIDE_RE = /\((blancas|white)\)/giu;
const BLACK_RE = /\((negras|black)\)/iu;

interface Item { start: number; end: number; square: string; lead?: string }

function items(text: string, offset: number): Item[] {
  return [...text.matchAll(ITEM_RE)].map((m) => ({
    start: offset + m.index!, end: offset + m.index! + m[0].length, square: m[2], lead: m[1],
  }));
}

/** Only joiners, commas and spaces between two items of a list. */
function joins(gap: string): boolean {
  return gap.split(/[\s,;]+/u).every((w) => w === '' || JOINERS.has(w.toLowerCase()));
}

/** What may stand between a side's last item and its name: joiners, "etc.", "y otras piezas …". */
function tailOk(tail: string): boolean {
  return joins(tail) || /^[\s,;]*(?:y|and)\s+(?:otr|other)[^()]*$/iu.test(tail);
}

function piece(item: Item, white: boolean, spanish: boolean): string | null {
  const type = !item.lead ? 'p' : FIGURINE[item.lead] ?? (spanish ? LETTERS_ES : LETTERS_EN)[item.lead];
  if (!type) return null;
  if (type === 'p' && /[18]$/.test(item.square)) return null;
  return white ? type.toUpperCase() : type;
}

/** Every position described in prose in `text`, with its piece placement. */
export function findProsePositions(text: string): ProsePosition[] {
  const found: ProsePosition[] = [];
  for (const side of text.matchAll(SIDE_RE)) {
    const whiteAt = side.index!;
    const spanish = side[1].toLowerCase() === 'blancas';
    const lineStart = text.lastIndexOf('\n', whiteAt) + 1;
    const after = text.slice(whiteAt + side[0].length, whiteAt + side[0].length + 300).split('\n')[0];
    const black = BLACK_RE.exec(after);
    if (!black || (black[1].toLowerCase() === 'negras') !== spanish) continue;

    // The white list: items read backwards from "(blancas)" as long as only joiners separate them.
    const before = items(text.slice(lineStart, whiteAt), lineStart);
    const white: Item[] = [];
    for (let i = before.length - 1; i >= 0; i--) {
      const nextStart = white.length ? white[0].start : whiteAt;
      const gap = text.slice(before[i].end, nextStart);
      if (white.length ? !joins(gap) : !tailOk(gap)) break;
      white.unshift(before[i]);
    }
    if (!white.length) continue;

    // The black list: everything between the two names, a dash first.
    const middleStart = whiteAt + side[0].length;
    const middle = after.slice(0, black.index);
    const blackItems = items(middle, middleStart);
    if (!blackItems.length || !/^[\s,;:—–-]*$/u.test(text.slice(middleStart, blackItems[0].start))) continue;
    const joined = blackItems.every((it, i) => i === 0 || joins(text.slice(blackItems[i - 1].end, it.start)));
    if (!joined || !tailOk(text.slice(blackItems.at(-1)!.end, middleStart + black.index))) continue;

    const pieces = new Map<string, string>();
    let ok = true;
    for (const [list, isWhite] of [[white, true], [blackItems, false]] as const) {
      for (const it of list) {
        const p = piece(it, isWhite, spanish);
        if (!p || pieces.has(it.square)) { ok = false; break; }
        pieces.set(it.square, p);
      }
    }
    if (!ok) continue;
    found.push({ charStart: white[0].start, charEnd: middleStart + black.index + black[0].length, pieces });
  }
  return found;
}

const FILES = 'abcdefgh';

function placement(pieces: Map<string, string>): string {
  const rows: string[] = [];
  for (let rank = 8; rank >= 1; rank--) {
    let row = '';
    let empty = 0;
    for (const f of FILES) {
      const p = pieces.get(`${f}${rank}`);
      if (!p) { empty++; continue; }
      if (empty) { row += empty; empty = 0; }
      row += p;
    }
    rows.push(row + (empty ? empty : ''));
  }
  return rows.join('/');
}

// Squares a missing king is placed on, most natural first: its own back ranks, corners first.
const KING_SQUARES = (white: boolean) => {
  const ranks = white ? [1, 2, 3, 4, 5, 6, 7, 8] : [8, 7, 6, 5, 4, 3, 2, 1];
  return ranks.flatMap((r) => [...'hagbfced'].map((f) => `${f}${r}`));
};

/** A legal setup: chess.js accepts it and the side that just moved is not in check. */
function setup(fen: string): Chess | null {
  try {
    const chess = new Chess(fen);
    const idle = chess.turn() === 'w' ? 'b' : 'w';
    const [king] = chess.findPiece({ type: 'k', color: idle });
    if (!king || chess.isAttacked(king, chess.turn())) return null;
    return chess;
  } catch { return null; }
}

/**
 * The FEN of a described position from which `moves` (English SAN, in order)
 * can all be played, `side` to move at move `fullmove`. A king the book leaves
 * out ("Sólo se indican los principales actores") is placed where the moves
 * can still be played. Null when no such position exists.
 */
export function proseFen(position: ProsePosition, side: 'w' | 'b', fullmove: number, moves: string[]): string | null {
  const has = (k: string) => [...position.pieces.values()].includes(k);
  const options = (k: 'K' | 'k') => has(k) ? [null] : KING_SQUARES(k === 'K').filter((sq) => !position.pieces.has(sq)).slice(0, 24);
  for (const wk of options('K')) {
    for (const bk of options('k')) {
      if (wk && wk === bk) continue;
      const pieces = new Map(position.pieces);
      if (wk) pieces.set(wk, 'K');
      if (bk) pieces.set(bk, 'k');
      const fen = `${placement(pieces)} ${side} - - 0 ${fullmove}`;
      const chess = setup(fen);
      if (!chess) continue;
      try {
        for (const san of moves) chess.move(san);
        return fen;
      } catch { /* not this placement */ }
    }
  }
  return null;
}
