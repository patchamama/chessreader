import { Chess } from 'chess.js';
/**
 * recognizeGames: finds chess game fragments in a prose text string.
 *
 * Strategy:
 *  1. Scan text for move-number tokens starting at 1.
 *  2. Collect the token sequence until a clear "game end" signal
 *     (result token, next game starting at 1., or long gap without moves).
 *  3. Build a GameTree for each collected sequence.
 *  4. Return recognised games with source span + GameTree.
 */

import { tokenize, type SanToken } from '../notation/sanTokenizer.js';

export { DIAGRAM_MARK } from '../notation/sanTokenizer.js';
import { figurineToAscii } from '../notation/figurineToAscii.js';
import { ENGINE_LINE_RE, spanishToEnglish } from '../notation/spanishToEnglish.js';
import { buildGameTree } from '../pgn/pgnToTree.js';
import { buildGameTreeTwoPass } from '../pgn/twoPassBuilder.js';
import { type GameTree } from '../model/gameTree.js';

const STANDARD_START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

/**
 * Recognition algorithm:
 *  - 1: mainline only — pass 1 of the two-pass builder. Builds just the clean
 *       main line (paragraphs starting with the contiguous next ply), no
 *       variations at all.
 *  - 2: two-pass, number-authoritative — mainline first, then variations
 *       anchored by move number. Keeps the mainline pristine. (Default.)
 *  - 3: legacy single-pass (validation-anchored). Kept for comparison.
 */
export interface RecognizeOptions {
  algorithm?: 1 | 2 | 3;
}

export interface RecognizedGame {
  /** Character offset in the original text where the game starts */
  charStart: number;
  /** Character offset (exclusive) where the game ends */
  charEnd: number;
  /** The raw source text slice */
  source: string;
  /** The built GameTree */
  tree: GameTree;
}

/** A FEN the board can be set up from (chess.js checks kings, counts, castling). */
function validFen(fen: string): boolean {
  const full = fen.split(' ').length >= 6 ? fen : `${fen} 0 1`;
  try { new Chess(full); return true; } catch { return false; }
}

/**
 * A FEN set before a fragment often carries a placeholder move number ("… w - - 0 1")
 * while the book goes on at its own one ("41 Rf5"); its engine line is numbered as
 * the FEN. When the first top-level numbered move after the FEN is of the side to
 * move and legal from it, that move's number is the game's: the FEN takes it and
 * the numbered moves between the FEN and that move (the engine line) are shifted by
 * the same amount. Moves that cannot follow the FEN leave everything as written.
 */
function renumberFromFens(tokens: SanToken[]): void {
  tokens.forEach((fenToken, i) => {
    if (fenToken.type !== 'fen' || !validFen(fenToken.fen!)) return;
    const parts = (fenToken.fen!.split(' ').length >= 6 ? fenToken.fen! : `${fenToken.fen} 0 1`).split(' ');
    const fullmove = Number(parts[5]);
    const color = parts[1] === 'b' ? 'black' : 'white';
    let depth = 0;
    // The numbered tokens written inside brackets before the first move (the engine line).
    const inside: SanToken[] = [];
    for (let j = i + 1; j < tokens.length; j++) {
      const t = tokens[j];
      if (t.type === 'fen' || t.type === 'result') return;
      if (t.type === 'variation-open') depth++;
      else if (t.type === 'variation-close') depth = Math.max(0, depth - 1);
      else if (depth > 0) inside.push(t);
      // A move named in a remark ("con la jugada 3…dxe4") is not where the game goes on.
      if (depth > 0 || t.type !== 'move' || t.isolated || t.moveNumber === undefined || !t.atParagraphStart) continue;
      const shift = t.moveNumber - fullmove;
      if (t.color !== color || shift === 0) return;
      let legal = false;
      try { legal = new Chess(parts.join(' ')).move(t.san!) !== null; } catch { legal = false; }
      if (!legal) return;
      parts[5] = String(t.moveNumber);
      fenToken.fen = parts.join(' ');
      for (const u of inside) {
        if ((u.type === 'move' || u.type === 'move-number') && u.moveNumber !== undefined) u.moveNumber += shift;
      }
      return;
    }
  });
}

export function recognizeGames(text: string, options: RecognizeOptions = {}): RecognizedGame[] {
  const algorithm = options.algorithm ?? 2;
  // Normalise figurine glyphs (♘→N) and then Spanish notation (Cf3→Nf3).
  // Both transforms are length-preserving for piece letters, so token offsets
  // stay aligned with the ORIGINAL `text` and we can recover the source token.
  // An engine line added to the book ("Stockfish 14 eval: [+0.48] 8 cxd5 …") is
  // an alternative to the next move: its label becomes an unclosed "{", which
  // the tokenizer closes at the end of the line (same length, offsets kept).
  const normalised = spanishToEnglish(figurineToAscii(text)).replace(ENGINE_LINE_RE, (line) =>
    line.replace(/^([ \t]*)[^\]]*\]/, (label, indent: string) => `${indent}{${' '.repeat(label.length - indent.length - 1)}`));

  const tokens = tokenize(normalised);

  if (tokens.length === 0) return [];

  // Attach the original source notation (rawSan) to every move token. A FEN is
  // taken as written: the Spanish letters (R = king) must not touch it.
  for (const token of tokens) {
    if (token.type === 'move') {
      token.rawSan = text.slice(token.charStart, token.charEnd);
    } else if (token.type === 'fen') {
      token.fen = text.slice(token.charStart, token.charEnd);
    }
  }

  renumberFromFens(tokens);

  // Split token stream into candidate game sequences.
  //
  // A `result` token (1-0, …) does NOT close the game: analysis prose with
  // variations frequently follows the result (e.g. "19. Be4 was stronger"),
  // and those moves belong to the SAME game. Instead, a result MARKS that any
  // following content is analysis. A genuinely new game only begins on a fresh
  // "1." move-number that appears AFTER a result (the PGN convention for
  // separating consecutive games), or on a "1." when no result has been seen
  // yet but a previous mainline already started from move 1.
  const gameSequences: SanToken[][] = [];
  let current: SanToken[] = [];
  let sawMove1 = false;
  // Nesting depth of ( … ) / [ … ] / { … }. Whatever is written inside is a
  // variation or a comment of the CURRENT game: a "1." in there (e.g. the
  // alternative first move "(1. c4 e5 2. g3)") never starts a new game.
  let depth = 0;
  // Has a bracket been opened in the current paragraph? A "1." that LEADS a
  // paragraph while only a bracket of an EARLIER paragraph is still open is a
  // new game: that bracket was simply never closed in the source.
  let openedInParagraph = false;

  // Number-only reading of the current game's mainline: the ply of the last
  // top-level move in a paragraph that opened with the contiguous next ply.
  // It tells whether a paragraph continues the game (next ply), analyses it
  // (an earlier ply) or cannot belong to it (a later ply: a gap).
  let lastMainPly = 0;
  let inMainParagraph = false;
  let paragraphDecided = false;
  const ply = (t: SanToken) => (t.moveNumber! - 1) * 2 + (t.color === 'black' ? 2 : 1);

  // A FRAGMENT: after a diagram the text may start at a later move ("23. Rxe5")
  // from the position the diagram shows — another game, or a part of this one
  // the text skipped. Its start position is not known here, so its moves cannot
  // be replayed; what matters is that they are NOT played on, nor hung from,
  // the game before the diagram. They are set apart until the game resumes at
  // its own next ply, or a new game starts.
  let afterDiagram = false;
  let inFragment = false;
  let fragmentLastPly = 0;
  // Furthest ply written at top level so far, whatever the paragraph. The
  // number-only reading above stalls when a variation or a remark interrupts a
  // line ("3. Bb5 (3. Bc4 …) a6 4. Ba4"); a paragraph is a fragment only when it
  // jumps past EVERYTHING the game has reached.
  let maxTopPly = 0;
  let prevTopPly = 0;

  const startNewGame = () => {
    if (current.some(t => t.type === 'move')) gameSequences.push(current);
    else startOf.delete(current);
    current = [];
    depth = 0;
    lastMainPly = 0;
    inFragment = false;
    maxTopPly = 0;
    prevTopPly = 0;
    mainParagraph = false;
  };

  // Tokens written inside a bracket that IS closed further on. Such a bracket is
  // a real comment or variation, however many lines it wraps over: a "1." in it
  // is quoted, not a new game. Only a bracket that is never closed is forgiven.
  const inClosedBracket = new Set<SanToken>();
  {
    const open: number[] = [];
    tokens.forEach((t, i) => {
      if (t.type === 'variation-open') open.push(i);
      else if (t.type === 'variation-close' && open.length > 0) {
        for (let j = open.pop()! + 1; j < i; j++) inClosedBracket.add(tokens[j]);
      } else if (t.type === 'result') open.length = 0;
    });
  }
  // Did the current paragraph open as a continuation of the game? Only such
  // paragraphs say how far the game has got (analysis paragraphs do not).
  let mainParagraph = false;

  // The start position of each sequence that begins at a FEN of the text, and
  // the FEN token itself (the game's span starts there, under its heading).
  const startOf = new Map<SanToken[], { fen: string; token: SanToken }>();

  for (const token of tokens) {
    // A FEN at top level starts a new game from that position, numbered as the
    // FEN says (a fragment of a game: "Partida 301 … 5rk1/… w - - 0 26").
    if (token.type === 'fen') {
      if (depth > 0 || !validFen(token.fen!)) continue;
      startNewGame();
      const full = token.fen!.split(' ').length >= 6 ? token.fen! : `${token.fen} 0 1`;
      startOf.set(current, { fen: full, token });
      const [, side, , , , fullmove] = full.split(' ');
      lastMainPly = (Number(fullmove) - 1) * 2 + (side === 'b' ? 1 : 0);
      maxTopPly = lastMainPly;
      sawMove1 = true;
      afterDiagram = false;
      continue;
    }
    if (token.type === 'paragraph-break') {
      openedInParagraph = false;
      prevTopPly = 0;
      if (depth === 0) { paragraphDecided = false; inMainParagraph = false; mainParagraph = false; }
    } else if (token.type === 'variation-open') {
      depth++;
      openedInParagraph = true;
    } else if (token.type === 'variation-close') {
      depth = Math.max(0, depth - 1);
    } else if (token.type === 'result') {
      // A result ends the game text; forgive any unbalanced bracket before it.
      depth = 0;
    } else if (token.type === 'diagram') {
      afterDiagram = true;
      // Kept in the sequence: the builder reads a bracket right after a
      // diagram as a line of the main game (see insertVariations).
      if (current.length > 0) current.push(token);
      continue;
    }

    // A fresh "1." (white) when the current sequence already has a move 1 and
    // some moves → the start of a NEW game: the board restarts from the initial
    // position. Post-result analysis uses higher move numbers (19., 20., …) and
    // stays in this game.
    if (token.type === 'move-number' && token.moveNumber === 1 && !token.isEllipsis) {
      // Inside a bracket opened in an EARLIER paragraph and never closed, a "1."
      // of a later paragraph is a new game ("Smith – Jones, London 1900 1. d4").
      const topLevel = depth === 0 || (!openedInParagraph && !inClosedBracket.has(token));
      if (topLevel && (sawMove1 || inFragment) && (inFragment || current.some(t => t.type === 'move'))) {
        startNewGame();
      }
      if (topLevel) { sawMove1 = true; afterDiagram = false; }
      current.push(token);
      continue;
    }

    // A bracket opened in an earlier paragraph and never closed (a slip of the
    // book: "11 Qg4!? (la partida fuente …, o bien 11 Nbd2 …" with no ")"):
    // a paragraph that opens with the game's next move is the game again. The
    // dangling brackets are closed right before it.
    if (token.type === 'move-number' && depth > 0 && token.atParagraphStart && !openedInParagraph
      && !inClosedBracket.has(token) && lastMainPly > 0 && ply(token) === lastMainPly + 1) {
      for (; depth > 0; depth--) {
        current.push({ type: 'variation-close', raw: '', charStart: token.charStart, charEnd: token.charStart });
      }
      paragraphDecided = false; inMainParagraph = false; mainParagraph = false;
    }

    // A paragraph that opens with a numbered move, at top level.
    if (token.type === 'move-number' && depth === 0 && token.atParagraphStart) {
      const p = ply(token);
      if (inFragment) {
        // Back to the game at its own next ply (unless the fragment itself
        // continues there); anything else stays with the fragment.
        if ((p === lastMainPly + 1 || p === maxTopPly + 1) && p !== fragmentLastPly + 1) inFragment = false;
      } else if (afterDiagram && lastMainPly > 0 && p > Math.max(lastMainPly, maxTopPly) + 1) {
        inFragment = true;
        fragmentLastPly = p - 1;
      }
      afterDiagram = false;
    }

    if (inFragment) {
      if (token.type === 'move' && !token.isolated && depth === 0) fragmentLastPly = Math.max(fragmentLastPly, ply(token));
      continue; // set apart: not part of the current game
    }

    if (token.type === 'move' && depth === 0 && !token.isolated) {
      const here = token.moveNumber !== undefined ? ply(token) : prevTopPly > 0 ? prevTopPly + 1 : 0;
      prevTopPly = here;
      const opensMain = !paragraphDecided && token.moveNumber !== undefined
        && here === lastMainPly + 1 && (!!token.atParagraphStart || lastMainPly === 0);
      if (opensMain) mainParagraph = true;
      if (mainParagraph) maxTopPly = Math.max(maxTopPly, here);
    }

    if (token.type === 'move' && depth === 0 && !token.isolated && token.moveNumber !== undefined) {
      const fits = ply(token) === lastMainPly + 1;
      if (!paragraphDecided) {
        paragraphDecided = true;
        inMainParagraph = fits && (!!token.atParagraphStart || lastMainPly === 0);
      }
      if (inMainParagraph) {
        if (fits) lastMainPly++;
        else inMainParagraph = false;
      }
    }

    // Result tokens stay in the sequence (analysis prose may follow).
    current.push(token);
  }

  if (current.some(t => t.type === 'move' || t.type === 'move-number')) {
    gameSequences.push(current);
  }

  // Character ranges written inside { … } (PGN comments).
  const braces: Array<[number, number]> = [];
  for (let i = 0, open = -1; i < normalised.length; i++) {
    if (normalised[i] === '{' && open < 0) open = i;
    else if (normalised[i] === '}' && open >= 0) { braces.push([open, i]); open = -1; }
  }
  const inBrace = (at: number) => braces.some(([a, b]) => at > a && at < b);

  const results: RecognizedGame[] = [];

  for (const seq of gameSequences) {
    const moveTokens = seq.filter(t => t.type === 'move');
    if (moveTokens.length === 0) continue;

    // The span runs from the game's first token to its last one. The line breaks
    // (and a diagram) collected after the last move belong to whatever follows —
    // often the next game's heading, which must not fall inside this game.
    // A bracket after the last move that holds no move ("Apertura Española (C62)")
    // is heading text too; one that closes a line of the game is kept.
    let first = 0;
    while (first < seq.length - 1 && seq[first].type === 'paragraph-break') first++;
    const content = (t: SanToken) => t.type === 'move' || t.type === 'move-number' || t.type === 'result'
      || t.type === 'annotation' || t.type === 'fen';
    let last = seq.length - 1;
    while (last > first && !content(seq[last])) last--;
    let open = 0;
    for (let k = first; k <= last; k++) {
      if (seq[k].type === 'variation-open') open++;
      else if (seq[k].type === 'variation-close') open = Math.max(0, open - 1);
    }
    for (let k = last + 1, empty = 0; k < seq.length && open > 0; k++) {
      if (seq[k].type === 'variation-open') empty++;
      else if (seq[k].type === 'variation-close') {
        if (empty > 0) empty--;
        else { open--; last = k; }
      }
    }
    const charStart = startOf.get(seq)?.token.charStart ?? seq[first].charStart;
    const charEnd = seq[last].charEnd;

    const start = startOf.get(seq)?.fen ?? STANDARD_START_FEN;
    const tree =
      algorithm === 1 ? buildGameTreeTwoPass(seq, start, true) // mainline only
      : algorithm === 2 ? buildGameTreeTwoPass(seq, start)
      : buildGameTree(seq, start);

    if (tree.nodes.size === 0) continue;

    // A move NAMED inside a PGN comment ("{ threatening 24...Nd3 }") is prose:
    // when it has no place in the game it is not a recognition error.
    tree.errors = tree.errors.filter(
      (e) => !((e.kind === 'unreferenced' || e.kind === 'wrong-number') && e.charStart !== undefined && inBrace(e.charStart)),
    );

    results.push({
      charStart,
      charEnd,
      source: normalised.slice(charStart, charEnd),
      tree,
    });
  }

  return results;
}
