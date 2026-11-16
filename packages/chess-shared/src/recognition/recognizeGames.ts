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
import { spanishToEnglish } from '../notation/spanishToEnglish.js';
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

export function recognizeGames(text: string, options: RecognizeOptions = {}): RecognizedGame[] {
  const algorithm = options.algorithm ?? 2;
  // Normalise figurine glyphs (♘→N) and then Spanish notation (Cf3→Nf3).
  // Both transforms are length-preserving for piece letters, so token offsets
  // stay aligned with the ORIGINAL `text` and we can recover the source token.
  const normalised = spanishToEnglish(figurineToAscii(text));

  const tokens = tokenize(normalised);

  if (tokens.length === 0) return [];

  // Attach the original source notation (rawSan) to every move token.
  for (const token of tokens) {
    if (token.type === 'move') {
      token.rawSan = text.slice(token.charStart, token.charEnd);
    }
  }

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

  const startNewGame = () => {
    if (current.some(t => t.type === 'move')) gameSequences.push(current);
    current = [];
    depth = 0;
    lastMainPly = 0;
    inFragment = false;
  };

  for (const token of tokens) {
    if (token.type === 'paragraph-break') {
      openedInParagraph = false;
      if (depth === 0) { paragraphDecided = false; inMainParagraph = false; }
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
      continue;
    }

    // A fresh "1." (white) when the current sequence already has a move 1 and
    // some moves → the start of a NEW game: the board restarts from the initial
    // position. Post-result analysis uses higher move numbers (19., 20., …) and
    // stays in this game.
    if (token.type === 'move-number' && token.moveNumber === 1 && !token.isEllipsis) {
      const topLevel = depth === 0 || (!!token.atParagraphStart && !openedInParagraph);
      if (topLevel && (sawMove1 || inFragment) && (inFragment || current.some(t => t.type === 'move'))) {
        startNewGame();
      }
      if (topLevel) { sawMove1 = true; afterDiagram = false; }
      current.push(token);
      continue;
    }

    // A paragraph that opens with a numbered move, at top level.
    if (token.type === 'move-number' && depth === 0 && token.atParagraphStart) {
      const p = ply(token);
      if (inFragment) {
        // Back to the game at its own next ply (unless the fragment itself
        // continues there); anything else stays with the fragment.
        if (p === lastMainPly + 1 && p !== fragmentLastPly + 1) inFragment = false;
      } else if (afterDiagram && lastMainPly > 0 && p > lastMainPly + 1) {
        inFragment = true;
        fragmentLastPly = p - 1;
      }
      afterDiagram = false;
    }

    if (inFragment) {
      if (token.type === 'move' && !token.isolated && depth === 0) fragmentLastPly = Math.max(fragmentLastPly, ply(token));
      continue; // set apart: not part of the current game
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

  const results: RecognizedGame[] = [];

  for (const seq of gameSequences) {
    const moveTokens = seq.filter(t => t.type === 'move');
    if (moveTokens.length === 0) continue;

    const charStart = seq[0].charStart;
    const charEnd = seq[seq.length - 1].charEnd;

    const tree =
      algorithm === 1 ? buildGameTreeTwoPass(seq, STANDARD_START_FEN, true) // mainline only
      : algorithm === 2 ? buildGameTreeTwoPass(seq, STANDARD_START_FEN)
      : buildGameTree(seq, STANDARD_START_FEN);

    if (tree.nodes.size === 0) continue;

    results.push({
      charStart,
      charEnd,
      source: normalised.slice(charStart, charEnd),
      tree,
    });
  }

  return results;
}
