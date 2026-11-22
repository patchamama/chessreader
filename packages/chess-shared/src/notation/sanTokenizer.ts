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
  | 'paragraph-break' // a newline / paragraph boundary in the source
  | 'result'
  | 'diagram'
  | 'fen';            // a FEN on its own line: a game (fragment) starts from that position        // 1-0, 0-1, 1/2-1/2, *

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
  /** Original source notation as written (e.g. "♘f3", "Cf3"); set by recognizeGames. */
  rawSan?: string;
  /** Determined by context: color of the move that follows this move-number */
  color?: 'white' | 'black';
  /**
   * true when this token is the FIRST move-ish token of its paragraph/line, i.e.
   * a paragraph break (newline) precedes it with no intervening move. The reader
   * uses this as a strong signal that a move-number here resumes the mainline.
   */
  atParagraphStart?: boolean;
  /**
   * true when this move token is NOT a reproducible game move: it is an isolated
   * SAN-looking token in prose (e.g. "—d5—", "la casilla e4") that is not chained
   * back to a move-number through adjacent tokens. Isolated moves must not enter
   * the game sequence; they are only highlighted as a single square on the board.
   * Only meaningful for type === 'move'.
   */
  isolated?: boolean;
  /**
   * The move was written in long notation ("e2-e4", "Ng1-f3", "e4xd5"). It is a
   * move of a line only next to other long moves or right after a move number;
   * among short moves it is a plan written in prose ("and then d4-d5").
   */
  long?: boolean;
  /** For a 'fen' token: the position, as written. */
  fen?: string;
}

/**
 * Max char gap (whitespace/punctuation) allowed between two chained tokens.
 * Real game moves are separated by a space or a "." → gap of 1-2. Isolated prose
 * moves are separated by words/dashes → gap of 7+. 3 is a safe threshold.
 */
const MAX_CHAIN_GAP = 3;

/**
 * Character that stands for a board diagram in recognition text (U+FFFC, the
 * "object replacement character"). The text extractor writes it, on its own
 * line, where the source shows a diagram image.
 */
export const DIAGRAM_MARK = '\uFFFC';

// SAN move pattern (English notation only — caller should normalise Spanish first)
// Note: no trailing \b because check (+) and mate (#) symbols are non-word chars
const SAN_MOVE_RE =
  /(?<![a-zA-Z])(O-O-O|O-O|[KQRBN][a-h1-8]?x?[a-h][1-8](?:=?[QRBN])?[+#]?[!?]*|[KQRBN][a-h1-8]?[a-h][1-8](?:=?[QRBN])?[+#]?[!?]*|[a-h]x?[a-h][1-8](?:=?[QRBN])?[+#]?[!?]*|[a-h][1-8](?:=?[QRBN])?[+#]?[!?]*)(?=[^a-zA-Z]|$)/g;

const MOVE_NUMBER_RE = /\b(\d{1,3})(\.{1,3})\s*/g;
const RESULT_RE = /\b(1-0|0-1|1\/2-1\/2|\*)\b/g;

/**
 * A list label that leads its line, such as "a1)", "b2)" or "c1)" in
 * "b2) 13 Bb5 a6": a square followed by a ")" that closes nothing. Books
 * enumerate the branches of their analysis this way; the label is not a move
 * (the moves after it still are). The same square closing a "( … )" variation
 * ("(14 Bb3 b2)") or written mid-line is left alone.
 */
function isEnumerationMarker(text: string, start: number, end: number, strayClosers: Set<number>): boolean {
  if (text[end] !== ')' || !strayClosers.has(end)) return false;
  if (!/^[a-h][1-8]$/.test(text.slice(start, end))) return false;
  const lineStart = text.lastIndexOf('\n', start - 1) + 1;
  return /^[ \t]*$/.test(text.slice(lineStart, start));
}

/** "bxa8Q" / "c1Q+" (promotion without the "=" many English books print) → "bxa8=Q" / "c1=Q+". */
function withPromotionSign(san: string): string {
  return san.replace(/^((?:[a-h]x)?[a-h][18])([QRBN])/, '$1=$2');
}

export function tokenize(text: string): SanToken[] {
  const tokens: SanToken[] = [];

  // We do a single linear scan. Build a set of all token positions.
  // Strategy: find move-number patterns first, then SAN moves in remaining gaps.

  type RawMatch = { start: number; end: number; token: SanToken };
  const matches: RawMatch[] = [];

  // Collect paragraph breaks (newlines). Consecutive newlines collapse into one
  // break token. These mark where a new paragraph/line begins in the source.
  {
    const re = /\n+/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
      matches.push({
        start: m.index,
        end: m.index + m[0].length,
        token: { type: 'paragraph-break', raw: m[0], charStart: m.index, charEnd: m.index + m[0].length },
      });
    }
  }

  // A FEN alone on its line ("5rk1/1pp5/… w - - 0 26"): a game starts there
  // from that position. Longer than any move inside it, so it wins the overlap.
  {
    const re = /^[ \t]*((?:[pnbrqkPNBRQK1-8]{1,8}\/){7}[pnbrqkPNBRQK1-8]{1,8} [wb] (?:-|[KQkq]{1,4}) (?:-|[a-h][36])(?: \d{1,3} \d{1,4})?)[ \t]*$/gm;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
      const start = m.index + m[0].indexOf(m[1]);
      matches.push({ start, end: start + m[1].length, token: { type: 'fen', raw: m[1], charStart: start, charEnd: start + m[1].length, fen: m[1] } });
    }
  }

  // Collect diagram marks: the place of a board diagram in the source. A game
  // fragment may start right after one, from the position the diagram shows.
  for (let i = 0; i < text.length; i++) {
    if (text[i] === DIAGRAM_MARK) {
      matches.push({ start: i, end: i + 1, token: { type: 'diagram', raw: DIAGRAM_MARK, charStart: i, charEnd: i + 1 } });
    }
  }

  // Collect variation markers. Parentheses, square brackets and braces all open
  // and close an isolated variation line: ( … ), [ … ], { … }.
  //
  // Brackets are matched BY TYPE: a closer only closes the innermost open
  // bracket of its own kind. A stray closer — an emoticon ":)" inside a
  // "{ comment }", an unmatched "]" — is plain text; emitting it would close the
  // wrong line and detach every move after it from its variation.
  const OPENERS = '([{';
  const CLOSERS = ')]}';
  const openStack: { ch: string; match: RawMatch }[] = [];
  const lineBraces: { ch: string; match: RawMatch }[] = [];
  // Closers that close nothing: plain text, like the ")" of a list label "b2)".
  const strayClosers = new Set<number>();
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    const top = openStack.length > 0 ? openStack[openStack.length - 1].ch : null;
    // Emoticons ":(" and — unless they close an open "(" — ":)" ";)" ":-)" are
    // never bracket markers.
    const emoticon = /[:;]-?$/.test(text.slice(Math.max(0, i - 2), i));
    if (emoticon && (ch === '(' || (ch === ')' && top !== '('))) continue;
    if (OPENERS.includes(ch)) {
      const match: RawMatch = {
        start: i, end: i + 1,
        token: { type: 'variation-open', raw: ch, charStart: i, charEnd: i + 1 }
      };
      openStack.push({ ch, match });
      matches.push(match);
    } else if (CLOSERS.includes(ch)) {
      const opener = OPENERS[CLOSERS.indexOf(ch)];
      let at = openStack.length - 1;
      while (at >= 0 && openStack[at].ch !== opener) at--;
      if (at < 0) { strayClosers.add(i); continue; } // stray closer: plain text
      // Openers left unclosed inside this bracket were plain text too — except a
      // "{" whose paragraph already ended (an engine line's label, a cut comment):
      // it is closed at the end of its paragraph below, like any unclosed "{".
      for (const stray of openStack.splice(at + 1)) {
        const nl = text.indexOf('\n', stray.match.end);
        if (stray.ch === '{' && nl >= 0 && nl < i) lineBraces.push(stray);
        else matches.splice(matches.indexOf(stray.match), 1);
      }
      openStack.pop();
      matches.push({
        start: i, end: i + 1,
        token: { type: 'variation-close', raw: ch, charStart: i, charEnd: i + 1 }
      });
    }
  }
  // A "{" never closed (a typo, a cut comment) would swallow the rest of the
  // text: it ends where its paragraph ends.
  for (const open of [...lineBraces, ...openStack]) {
    if (open.ch !== '{') continue;
    const nl = text.indexOf('\n', open.match.end);
    if (nl < 0) continue;
    matches.push({ start: nl, end: nl, token: { type: 'variation-close', raw: '', charStart: nl, charEnd: nl } });
  }

  // Collect move numbers
  {
    // "12.", "12...", "12…" and — as some books print them — a bare "12 "
    // right before a move ("1 d4 d5 2 c4"). A bare number before a word
    // ("en 2 partidas") is prose.
    // English books print Black's numbers with a space before the dots ("5 ... Kd8"): the ellipsis may follow spaces.
    const re = /(?<!\$)\b(\d{1,3})(\.{1,3}|\u2026|[ \t]+(?:\.{2,3}|\u2026)|\s(?=(?:O-O|[KQRBN][a-h1-8]?x?[a-h][1-8]|[a-h]x[a-h][1-8](?:=?[QRBN])?|[a-h][1-8](?:=?[QRBN])?)(?![a-zA-Z])))/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
      const num = parseInt(m[1], 10);
      const dots = m[2];
      const isEllipsis = /\.\.|\u2026/.test(dots);
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
      if (isEnumerationMarker(text, m.index, m.index + m[0].length, strayClosers)) continue;
      matches.push({
        start: m.index,
        end: m.index + m[0].length,
        token: {
          type: 'move',
          raw: m[0],
          charStart: m.index,
          charEnd: m.index + m[0].length,
          san: withPromotionSign(m[0]),
        }
      });
    }
  }

  // Collect moves in long notation: "e2-e4", "Ng1-f3", "e4xd5", "e7-e8=Q".
  // Longer than the short moves inside them, so they win the overlap below.
  {
    const re = /(?<![a-zA-Z0-9])([KQRBN])?([a-h][1-8])([-\u2013x:])([a-h][1-8])(?:=?([QRBN]))?([+#]?[!?]*)(?=[^a-zA-Z0-9]|$)/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
      const [, piece, from, sep, to, promo, suffix] = m;
      const capture = sep === 'x' || sep === ':';
      const san = piece
        ? `${piece}${from}${capture ? 'x' : ''}${to}${suffix}`
        : `${capture ? `${from[0]}x` : ''}${to}${promo ? `=${promo}` : ''}${suffix}`;
      matches.push({
        start: m.index,
        end: m.index + m[0].length,
        token: { type: 'move', raw: m[0], charStart: m.index, charEnd: m.index + m[0].length, san, long: true },
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

  // Assign color to moves based on preceding move-number.
  //
  // Reproducibility chain: a move is a real game move only if it is connected,
  // through small char gaps, back to a move-number. We track `chainEnd` = the
  // charEnd of the last token in the live chain. A move-number (re)seeds the
  // chain; a '(' that opens right after a live chain lets the paren inherit it
  // (saved/restored on ')'). A move whose gap to the chain is too large is an
  // isolated prose token (marked `isolated`) and breaks the chain.
  let currentMoveNumber = 1;
  let nextColor: 'white' | 'black' = 'white';

  // chainEnd = charEnd of the last chained token, or null when the chain is dead.
  let chainEnd: number | null = null;
  const chainStack: Array<number | null> = [];
  // charEnd of the most recent paragraph-break, or null once consumed. Used to
  // verify the NEXT move-ish token sits at the real start of the paragraph (only
  // whitespace/punctuation between the break and the token — no prose words).
  let paragraphBreakEnd: number | null = null;
  // Set when a paragraph-leading move-number was seen, to also flag its move.
  let carryParagraphStart = false;
  // What the live chain ended with: a long move continues only a number or another long move.
  let chainTail: 'number' | 'long' | 'short' | null = null;

  // PGN NAGs ("$14", "$132") annotate the previous move; they are not prose, so
  // they do not count towards the gap: "10. Nd2! $14 O-O-O" is one chain.
  const chained = (start: number): boolean => {
    if (chainEnd === null) return false;
    if (start - chainEnd <= MAX_CHAIN_GAP) return true;
    const between = text.slice(chainEnd, start).replace(/\s*\$\d+/g, '');
    return between.length <= MAX_CHAIN_GAP;
  };

  // A token leads its paragraph only if everything between the break and the
  // token is non-letter (spaces, digits-as-part-of-number handled separately,
  // punctuation) — i.e. no prose words precede it on that line.
  const leadsParagraph = (tokenStart: number): boolean => {
    if (paragraphBreakEnd === null) return false;
    const between = text.slice(paragraphBreakEnd, tokenStart);
    return !/[A-Za-zÀ-ÿ]/.test(between);
  };

  for (const { token } of nonOverlapping) {
    if (token.type === 'paragraph-break') {
      // A newline breaks the reproducibility chain (a move after a newline is in
      // a new paragraph, not glued to the previous token).
      paragraphBreakEnd = token.charEnd;
      chainEnd = null;
      // Emit the break so consumers (two-pass builder) can see paragraph bounds.
      tokens.push(token);
      continue;
    }
    if (token.type === 'move-number') {
      currentMoveNumber = token.moveNumber!;
      nextColor = token.isEllipsis ? 'black' : 'white';
      if (leadsParagraph(token.charStart)) {
        token.atParagraphStart = true;
        // Carry the flag onto the first move of this number too.
        carryParagraphStart = true;
      }
      paragraphBreakEnd = null;
      // A move-number always seeds/keeps the chain alive.
      chainEnd = token.charEnd;
      chainTail = 'number';
      tokens.push(token);
    } else if (token.type === 'move') {
      token.moveNumber = currentMoveNumber;
      token.color = nextColor;
      if (leadsParagraph(token.charStart) || carryParagraphStart) {
        token.atParagraphStart = true;
        carryParagraphStart = false;
      }
      paragraphBreakEnd = null;
      nextColor = nextColor === 'white' ? 'black' : 'white';
      // A long move after short ones is a plan in the prose ("…Qxe4 and d4-d5").
      const plan = token.long && chainTail === 'short';
      if (chained(token.charStart) && !plan) {
        chainEnd = token.charEnd;
        chainTail = token.long ? 'long' : 'short';
      } else {
        token.isolated = true;
        chainEnd = null;
      }
      tokens.push(token);
    } else if (token.type === 'variation-open') {
      // A paren between a paragraph-leading number and its move cancels the carry.
      carryParagraphStart = false;
      paragraphBreakEnd = null;
      // The paren inherits the chain only if it opens adjacent to a live chain.
      chainStack.push(chainEnd);
      chainEnd = chained(token.charStart) ? token.charEnd : null;
      tokens.push(token);
    } else if (token.type === 'variation-close') {
      // A move right after ')' continues the enclosing line, so the close paren
      // anchors the chain at its own position — but only if the line was alive
      // either before the paren or inside it. A purely-prose paren stays dead.
      const savedPre = chainStack.length > 0 ? chainStack.pop()! : null;
      chainEnd = savedPre !== null || chainEnd !== null ? token.charEnd : null;
      tokens.push(token);
    } else {
      // result / other: does not extend the move chain.
      chainEnd = null;
      tokens.push(token);
    }
  }

  return tokens;
}
