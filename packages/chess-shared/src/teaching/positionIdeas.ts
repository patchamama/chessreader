/**
 * Position ideas: what a coach sees on the board before any move is played —
 * pieces that hang, pieces nobody defends, outposts, pinned pieces, the pawn
 * structure, the open files. Pure geometry from a FEN; no engine.
 *
 * These are the raw material for commentary: the rule-based annotator turns
 * them into remarks, and a language model can be given them as facts.
 */

import { Chess, type Square, type PieceSymbol, type Color as ChessColor } from 'chess.js';

export interface PieceRef {
  square: string;
  piece: PieceSymbol;
  color: 'white' | 'black';
}

export interface PieceStatus extends PieceRef {
  /** Squares of the enemy pieces attacking it / of its own pieces defending it. */
  attackers: string[];
  defenders: string[];
}

export interface PositionIdeas {
  /** Every piece with who attacks and who defends it. */
  pieces: PieceStatus[];
  /** Attacked and either undefended or attacked by something cheaper. */
  hanging: Array<PieceRef & { attackers: string[] }>;
  /** Pieces (not pawns, not kings) that nothing defends and nothing attacks yet. */
  loose: PieceRef[];
  /** Knights and bishops on a square no enemy pawn can ever attack, held by an own pawn. */
  outposts: PieceRef[];
  /** Pieces that cannot move without exposing their king. */
  pinned: Array<PieceRef & { by: string }>;
  passedPawns: PieceRef[];
  isolatedPawns: PieceRef[];
  doubledPawns: PieceRef[];
  /** Files with no pawn at all / with pawns of one side only. */
  openFiles: string[];
  halfOpenFiles: Array<{ file: string; for: 'white' | 'black' }>;
}

export const PIECE_VALUE: Record<PieceSymbol, number> = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 100 };
const FILES = 'abcdefgh';
const name = (c: ChessColor) => (c === 'w' ? 'white' : 'black') as 'white' | 'black';
const fileOf = (s: string) => FILES.indexOf(s[0]);
const rankOf = (s: string) => Number(s[1]);

export function positionIdeas(fen: string): PositionIdeas {
  const chess = new Chess(fen);
  const all: Array<{ square: Square; type: PieceSymbol; color: ChessColor }> = [];
  for (const row of chess.board()) for (const p of row) if (p) all.push(p);
  const ref = (p: { square: string; type: PieceSymbol; color: ChessColor }): PieceRef => ({ square: p.square, piece: p.type, color: name(p.color) });
  const other = (c: ChessColor): ChessColor => (c === 'w' ? 'b' : 'w');
  const at = (s: string) => chess.get(s as Square);

  const pieces: PieceStatus[] = all.map((p) => ({
    ...ref(p),
    attackers: chess.attackers(p.square, other(p.color)).sort(),
    defenders: chess.attackers(p.square, p.color).sort(),
  }));

  const hanging = pieces
    .filter((p) => p.piece !== 'k' && p.attackers.length > 0
      && (p.defenders.length === 0 || p.attackers.some((a) => PIECE_VALUE[at(a)!.type] < PIECE_VALUE[p.piece])))
    .map(({ square, piece, color, attackers }) => ({ square, piece, color, attackers }));
  const loose = pieces
    .filter((p) => p.piece !== 'k' && p.piece !== 'p' && p.attackers.length === 0 && p.defenders.length === 0)
    .map(({ square, piece, color }) => ({ square, piece, color }));

  const pawns = all.filter((p) => p.type === 'p');
  const pawnsOf = (c: ChessColor) => pawns.filter((p) => p.color === c);
  /** Can a pawn of `by` ever attack `square`? (one on a neighbouring file that has not passed it yet) */
  const chaseable = (square: string, by: ChessColor) =>
    pawnsOf(by).some((p) => Math.abs(fileOf(p.square) - fileOf(square)) === 1
      && (by === 'b' ? rankOf(p.square) > rankOf(square) : rankOf(p.square) < rankOf(square)));
  const pawnGuards = (square: string, c: ChessColor) =>
    pawnsOf(c).some((p) => Math.abs(fileOf(p.square) - fileOf(square)) === 1 && rankOf(p.square) === rankOf(square) + (c === 'w' ? -1 : 1));
  const outposts = all
    .filter((p) => (p.type === 'n' || p.type === 'b')
      && (p.color === 'w' ? rankOf(p.square) >= 4 && rankOf(p.square) <= 6 : rankOf(p.square) >= 3 && rankOf(p.square) <= 5)
      && pawnGuards(p.square, p.color) && !chaseable(p.square, other(p.color)))
    .map(ref);

  // Absolute pins: an enemy slider, one own piece, then the king on a line.
  const pinned: Array<PieceRef & { by: string }> = [];
  for (const king of all.filter((p) => p.type === 'k')) {
    for (const [df, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]) {
      const seen: string[] = [];
      for (let f = fileOf(king.square) + df, r = rankOf(king.square) + dr; f >= 0 && f < 8 && r >= 1 && r <= 8 && seen.length < 2; f += df, r += dr) {
        const s = `${FILES[f]}${r}`;
        if (at(s)) seen.push(s);
      }
      if (seen.length < 2) continue;
      const [mine, theirs] = seen.map((s) => at(s)!);
      const lineOk = df === 0 || dr === 0 ? 'rq'.includes(theirs.type) : 'bq'.includes(theirs.type);
      if (mine.color === king.color && theirs.color !== king.color && lineOk) {
        pinned.push({ square: seen[0], piece: mine.type, color: name(mine.color), by: seen[1] });
      }
    }
  }

  const passedPawns = pawns.filter((p) => !pawnsOf(other(p.color)).some((o) =>
    Math.abs(fileOf(o.square) - fileOf(p.square)) <= 1 && (p.color === 'w' ? rankOf(o.square) > rankOf(p.square) : rankOf(o.square) < rankOf(p.square)))).map(ref);
  const isolatedPawns = pawns.filter((p) => !pawnsOf(p.color).some((o) => Math.abs(fileOf(o.square) - fileOf(p.square)) === 1)).map(ref);
  const doubledPawns = pawns.filter((p) => pawnsOf(p.color).some((o) => o !== p && fileOf(o.square) === fileOf(p.square))).map(ref);

  const openFiles: string[] = [];
  const halfOpenFiles: Array<{ file: string; for: 'white' | 'black' }> = [];
  for (const file of FILES) {
    const w = pawnsOf('w').some((p) => p.square[0] === file);
    const b = pawnsOf('b').some((p) => p.square[0] === file);
    if (!w && !b) openFiles.push(file);
    else if (!w) halfOpenFiles.push({ file, for: 'white' });
    else if (!b) halfOpenFiles.push({ file, for: 'black' });
  }

  const bySquare = (a: PieceRef, b: PieceRef) => a.square.localeCompare(b.square);
  return {
    pieces, hanging: hanging.sort(bySquare), loose: loose.sort(bySquare), outposts: outposts.sort(bySquare), pinned,
    passedPawns: passedPawns.sort(bySquare), isolatedPawns: isolatedPawns.sort(bySquare), doubledPawns: doubledPawns.sort(bySquare),
    openFiles, halfOpenFiles,
  };
}
