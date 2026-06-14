/**
 * Converts Unicode chess figurines to ASCII SAN piece letters.
 *
 * Book prose frequently uses figurine glyphs (e.g. "♘f3", "♖ad1") instead of
 * the ASCII letters the SAN tokenizer understands. Both colours map to the same
 * letter because SAN notation is colour-agnostic (the side to move is implied).
 *
 * The transform is LENGTH-PRESERVING: every glyph is a single UTF-16 BMP code
 * unit and maps to exactly one output character. Pawn glyphs (♙ ♟) map to a
 * single space rather than the empty string so that character offsets stay
 * aligned with the original text — this lets callers recover the original book
 * token via `text.slice(charStart, charEnd)`.
 */

const GLYPH_TO_ASCII: Record<string, string> = {
  // White
  '♔': 'K', // ♔
  '♕': 'Q', // ♕
  '♖': 'R', // ♖
  '♗': 'B', // ♗
  '♘': 'N', // ♘
  '♙': ' ', // ♙ pawn — no SAN letter
  // Black
  '♚': 'K', // ♚
  '♛': 'Q', // ♛
  '♜': 'R', // ♜
  '♝': 'B', // ♝
  '♞': 'N', // ♞
  '♟': ' ', // ♟ pawn — no SAN letter
};

const GLYPH_RE = /[♔-♟]/g;

export function figurineToAscii(text: string): string {
  return text.replace(GLYPH_RE, (g) => GLYPH_TO_ASCII[g] ?? g);
}
