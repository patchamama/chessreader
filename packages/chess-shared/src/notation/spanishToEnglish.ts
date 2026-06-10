/**
 * Converts Spanish chess notation (SAN) to English SAN.
 *
 * Spanish piece letters:
 *  C -> N (Caballo / Knight)
 *  A -> B (Alfil / Bishop)
 *  D -> Q (Dama / Queen)
 *  T -> R (Torre / Rook)
 *  R (Rey / King) -> K  — but ONLY when it starts or follows expected SAN patterns
 *
 * Castling normalisation: 0-0 -> O-O, 0-0-0 -> O-O-O
 *
 * Order of substitution matters:
 *  1. Normalise castling BEFORE piece substitutions (avoids 0->O being confused)
 *  2. Replace T->R before R->K so we don't re-process T-derived Rs
 *  3. Use word-boundary / positional logic so 'R' as King doesn't clobber file 'r'
 */

/**
 * Pure token conversion: converts a single SAN token written in Spanish to English.
 * Input must already be a clean SAN token (no leading/trailing whitespace).
 */
export function spanishTokenToEnglish(token: string): string {
  // Castling: 0-0-0 -> O-O-O, 0-0 -> O-O (before piece mapping)
  let t = token
    .replace(/^0-0-0$/, 'O-O-O')
    .replace(/^0-0$/, 'O-O');

  // If it's already an O-O variant, no piece substitution needed
  if (t === 'O-O-O' || t === 'O-O') return t;

  // Piece substitutions — uppercase only (lowercase are files/squares)
  // Order matters:
  //  1. T->R first (Torre = Rook) — use a temporary placeholder __ROOK__ to prevent R->K from re-processing it
  //  2. C->N (Caballo = Knight)
  //  3. A->B (Alfil = Bishop)
  //  4. D->Q (Dama = Queen)
  //  5. R->K (Rey = King) — only for the ORIGINAL R, not T-derived Rs
  //  6. Restore __ROOK__ -> R
  t = t
    .replace(/^T/, '__ROOK__')   // Torre -> placeholder
    .replace(/^C/, 'N')           // Caballo -> Knight
    .replace(/^A/, 'B')           // Alfil -> Bishop
    .replace(/^D/, 'Q')           // Dama -> Queen
    .replace(/^R/, 'K')           // Rey -> King (original R only)
    .replace(/^__ROOK__/, 'R');   // restore Rook

  return t;
}

/**
 * Converts a full PGN/prose string with Spanish chess notation to English.
 * Replaces Spanish piece letters in SAN move tokens only.
 * Also normalises castling, move-number dots, and ellipsis.
 */
/**
 * Detects if text is already written in English chess notation.
 * Heuristic: if K, N, Q or B appear as piece moves (uppercase letter before
 * a square or 'x'), and no Spanish-only markers (C, D, T before squares) are
 * found, treat as English.
 */
// Strict SAN tail after a piece letter: optional disambiguation file/rank,
// optional capture marker, then a target square. This prevents prose words
// like "Después" (D+e) or "Cada" (C+a) from being mistaken for moves.
const SAN_TAIL = '[a-h1-8]?x?[a-h][1-8]'

function isEnglishNotation(text: string): boolean {
  // English piece letters: K, Q, R, B, N followed by a full SAN move shape
  const hasEnglish = new RegExp(`(?:^|[\\s(])[KQRBN]${SAN_TAIL}`).test(text)
  // Spanish-only piece letters: C (Caballo), D (Dama), T (Torre)
  const hasSpanish  = new RegExp(`(?:^|[\\s(])[CDT]${SAN_TAIL}`).test(text)
  return hasEnglish && !hasSpanish
}

export function spanishToEnglish(text: string): string {
  // Normalise ellipsis variants
  let result = text
    .replace(/…/g, '...')
    .replace(/&#8230;/g, '...');

  // Normalise castling zero-based to letter-based (applies to both languages)
  result = result
    .replace(/\b0-0-0\b/g, 'O-O-O')
    .replace(/\b0-0\b/g, 'O-O')
    .replace(/\b0–0–0\b/g, 'O-O-O')
    .replace(/\b0–0\b/g, 'O-O');

  // If already English notation, skip piece-letter substitution.
  // This prevents Re1 (Rook e1) from being mangled into Ke1 (King e1).
  if (isEnglishNotation(result)) return result;

  // Replace Spanish piece letters that start a SAN token.
  // A SAN token starts after whitespace, '(', or beginning of string,
  // and the piece letter must be followed by a FULL SAN move shape
  // (so prose like "Cada" or "Después" is never converted).
  // Use a placeholder for Torre (T=Rook) so R->K substitution doesn't clobber it
  const tail = `(?=${SAN_TAIL})`;
  result = result
    // T (Torre/Rook) -> placeholder — must come BEFORE R (Rey/King)
    .replace(new RegExp(`(?<=^|[\\s(])T${tail}`, 'g'), '\x00ROOK\x00')
    // C (Caballo/Knight) -> N
    .replace(new RegExp(`(?<=^|[\\s(])C${tail}`, 'g'), 'N')
    // A (Alfil/Bishop) -> B
    .replace(new RegExp(`(?<=^|[\\s(])A${tail}`, 'g'), 'B')
    // D (Dama/Queen) -> Q
    .replace(new RegExp(`(?<=^|[\\s(])D${tail}`, 'g'), 'Q')
    // R (Rey/King) -> K  — only in Spanish context (no English markers present)
    .replace(new RegExp(`(?<=^|[\\s(])R${tail}`, 'g'), 'K')
    // Restore Rook placeholder
    .replace(/\x00ROOK\x00/g, 'R');

  return result;
}
