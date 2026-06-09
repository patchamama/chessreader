/**
 * SAN tokenizer: scans a text string and returns chess move tokens
 * preserving character offsets (needed for clickable span mapping).
 *
 * Handles:
 * - Move numbers: "12." and "12..." (ellipsis = black's move)
 * - Standard piece moves: Nf3, Bc4, Qxd5, Rxe8+, Kh1
 * - Pawn moves: e4, exd5, e8=Q
 * - Castling: O-O, O-O-O (English normalised)
 * - Checks/mates: +, #
 * - Annotations: !, ?, !!, ??, !?, ?!
 * - Parenthesised variations: (, )
 */

export type TokenType =
  | 'move-number'    // "1." or "1..."
  | 'move'           // SAN move token
  | 'variation-open'  // (
  | 'variation-close' // )
  | 'annotation'     // !, ?, etc. standalone
  | 'result';        // 1-0, 0-1, 1/2-1/2, *

export interface SanToken {
  type: TokenType;
  raw: string;        // raw text as found in source
  charStart: number;
  charEnd: number;    // exclusive
  /** Parsed move number (only for move-number tokens) */
  moveNumber?: number;
  /** true if this is a black's continuation move number (1...) */
  isEllipsis?: boolean;
  /** Normalised English SAN (only for move tokens) */
  san?: string;
  /** Determined by context: color of the move that follows this move-number */
  color?: 'white' | 'black';
}

// SAN move pattern (English notation only — caller should normalise Spanish first)
// Note: no trailing \b because check (+) and mate (#) symbols are non-word chars
const SAN_MOVE_RE =
  /(?<![a-zA-Z])(O-O-O|O-O|[KQRBN][a-h1-8]?x?[a-h][1-8](?:=[QRBN])?[+#]?[!?]*|[KQRBN][a-h1-8]?[a-h][1-8](?:=[QRBN])?[+#]?[!?]*|[a-h]x?[a-h][1-8](?:=[QRBN])?[+#]?[!?]*|[a-h][1-8](?:=[QRBN])?[+#]?[!?]*)(?=[^a-zA-Z]|$)/g;

const MOVE_NUMBER_RE = /\b(\d{1,3})(\.{1,3})\s*/g;
const RESULT_RE = /\b(1-0|0-1|1\/2-1\/2|\*)\b/g;

export function tokenize(text: string): SanToken[] {
  const tokens: SanToken[] = [];

  // We do a single linear scan. Build a set of all token positions.
  // Strategy: find move-number patterns first, then SAN moves in remaining gaps.

  type RawMatch = { start: number; end: number; token: SanToken };
  const matches: RawMatch[] = [];

  // Collect variation markers
  for (let i = 0; i < text.length; i++) {
    if (text[i] === '(') {
      matches.push({
        start: i, end: i + 1,
        token: { type: 'variation-open', raw: '(', charStart: i, charEnd: i + 1 }
      });
    } else if (text[i] === ')') {
      matches.push({
        start: i, end: i + 1,
        token: { type: 'variation-close', raw: ')', charStart: i, charEnd: i + 1 }
      });
    }
  }

  // Collect move numbers
  {
    const re = /\b(\d{1,3})(\.{1,3})/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
      const num = parseInt(m[1], 10);
      const dots = m[2];
      const isEllipsis = dots.length >= 2;
      matches.push({
        start: m.index,
        end: m.index + m[0].length,
        token: {
          type: 'move-number',
          raw: m[0],
          charStart: m.index,
          charEnd: m.index + m[0].length,
          moveNumber: num,
          isEllipsis,
          color: isEllipsis ? 'black' : 'white',
        }
      });
    }
  }

  // Collect result tokens
  {
    const re = /\b(1-0|0-1|1\/2-1\/2|\*)\b/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
      matches.push({
        start: m.index,
        end: m.index + m[0].length,
        token: { type: 'result', raw: m[0], charStart: m.index, charEnd: m.index + m[0].length }
      });
    }
  }

  // Collect SAN moves
  {
    const re = new RegExp(SAN_MOVE_RE.source, 'g');
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
      matches.push({
        start: m.index,
        end: m.index + m[0].length,
        token: {
          type: 'move',
          raw: m[0],
          charStart: m.index,
          charEnd: m.index + m[0].length,
          san: m[0],
        }
      });
    }
  }

  // Sort by start position, resolve overlaps (prefer longer / earlier)
  matches.sort((a, b) => a.start - b.start || b.end - a.end);

  const used = new Set<number>();
  const nonOverlapping: RawMatch[] = [];

  for (const match of matches) {
    let conflict = false;
    for (let i = match.start; i < match.end; i++) {
      if (used.has(i)) { conflict = true; break; }
    }
    if (!conflict) {
      for (let i = match.start; i < match.end; i++) used.add(i);
      nonOverlapping.push(match);
    }
  }

  nonOverlapping.sort((a, b) => a.start - b.start);

  // Assign color to moves based on preceding move-number
  let currentMoveNumber = 1;
  let nextColor: 'white' | 'black' = 'white';

  for (const { token } of nonOverlapping) {
    if (token.type === 'move-number') {
      currentMoveNumber = token.moveNumber!;
      nextColor = token.isEllipsis ? 'black' : 'white';
      tokens.push(token);
    } else if (token.type === 'move') {
      token.moveNumber = currentMoveNumber;
      token.color = nextColor;
      nextColor = nextColor === 'white' ? 'black' : 'white';
      tokens.push(token);
    } else {
      tokens.push(token);
    }
  }

  return tokens;
}
