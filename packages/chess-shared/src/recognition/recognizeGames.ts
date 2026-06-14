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
import { figurineToAscii } from '../notation/figurineToAscii.js';
import { spanishToEnglish } from '../notation/spanishToEnglish.js';
import { buildGameTree } from '../pgn/pgnToTree.js';
import { type GameTree } from '../model/gameTree.js';

const STANDARD_START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

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

export function recognizeGames(text: string): RecognizedGame[] {
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
  // A new game starts when we see a move-number token with value 1 and it's not after a variation-close.
  const gameSequences: SanToken[][] = [];
  let current: SanToken[] = [];

  for (const token of tokens) {
    if (
      token.type === 'move-number' &&
      token.moveNumber === 1 &&
      !token.isEllipsis &&
      current.some(t => t.type === 'move')
    ) {
      // Start of a new game
      gameSequences.push(current);
      current = [token];
    } else if (token.type === 'result' && current.length > 0) {
      current.push(token);
      gameSequences.push(current);
      current = [];
    } else {
      current.push(token);
    }
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

    const tree = buildGameTree(seq, STANDARD_START_FEN);

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
