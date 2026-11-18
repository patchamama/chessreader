import { useCallback } from 'react'
import { useSettingsStore, type AppLanguage, type NotationStyle } from '../settings/settingsStore'

/**
 * The one formatter of chess notation (S12): every SAN the app shows goes
 * through here, so pieces read as figurines (♞f3) or as the letters of the
 * selected language (Cf3 in Spanish, Sf3 in German, Nf3 in English).
 *
 * Input is English SAN, or SAN whose piece is already a figurine (engine
 * lines). Pawn moves, castling and words that are not moves stay as they are.
 */

type Piece = 'K' | 'Q' | 'R' | 'B' | 'N'

export const PIECE_LETTERS: Record<AppLanguage, Record<Piece, string>> = {
  en: { K: 'K', Q: 'Q', R: 'R', B: 'B', N: 'N' },
  es: { K: 'R', Q: 'D', R: 'T', B: 'A', N: 'C' },
  de: { K: 'K', Q: 'D', R: 'T', B: 'L', N: 'S' },
}

/** Solid glyphs for both colours inside running text (the convention of the engine lines). */
export const PIECE_FIGURINES: Record<Piece, string> = { K: '♚', Q: '♛', R: '♜', B: '♝', N: '♞' }

const FIGURINE_PIECE: Record<string, Piece> = {
  '♔': 'K', '♕': 'Q', '♖': 'R', '♗': 'B', '♘': 'N',
  '♚': 'K', '♛': 'Q', '♜': 'R', '♝': 'B', '♞': 'N',
}

const pieceOut = (p: Piece, lang: AppLanguage, style: NotationStyle) =>
  style === 'figurine' ? PIECE_FIGURINES[p] : (PIECE_LETTERS[lang] ?? PIECE_LETTERS.en)[p]

/** The piece an English letter or a figurine stands for, or null. */
const pieceIn = (c: string): Piece | null => FIGURINE_PIECE[c] ?? (/^[KQRBN]$/.test(c) ? (c as Piece) : null)

// A piece move: piece, optional disambiguation, optional capture, destination, then marks.
const PIECE_MOVE = /^([KQRBN♔♕♖♗♘♚♛♜♝♞])([a-h]?[1-8]?x?[a-h][1-8].*)$/u
// A pawn promotion: "e8=Q", "exd1=♞+".
const PROMOTION = /^([a-h](?:x[a-h])?[1-8]=)([QRBN♕♖♗♘♛♜♝♞])(.*)$/u

/** One SAN move with the chosen piece notation ("Nf3" → "Cf3" / "♞f3"). */
export function formatSan(san: string, lang: AppLanguage, style: NotationStyle): string {
  const move = PIECE_MOVE.exec(san)
  if (move) return pieceOut(pieceIn(move[1])!, lang, style) + move[2]
  const promo = PROMOTION.exec(san)
  if (promo) return promo[1] + pieceOut(pieceIn(promo[2])!, lang, style) + promo[3]
  return san
}

// A move number glued to or spaced from the move: "12.", "12...", "12…", "9... ".
const NUMBER = /^((?:\d+\s*(?:\.\.\.|\.|…)\s*)?)(.*)$/su

/** A written line of moves ("1. e4 e5 2. Nf3"): every move formatted, numbers and spacing kept. */
export function formatLine(text: string, lang: AppLanguage, style: NotationStyle): string {
  return text.split(/(\s+)/).map((tok) => {
    if (!tok || /^\s+$/.test(tok)) return tok
    const [, num = '', rest] = NUMBER.exec(tok)!
    return num + formatSan(rest, lang, style)
  }).join('')
}

// Any piece symbol a book may use: letters of the supported languages or figurines.
const WRITTEN_PIECE = /^([KQRBNDTACSL♔♕♖♗♘♚♛♜♝♞])(?=[a-h1-8x])/u

/**
 * A move token as a book or a line writes it ("Cf3", "15.♘xe5!"), shown with
 * the chosen notation. `san` is its canonical English SAN: it says which piece
 * moved, so the written symbol is replaced whatever language it was in. Tokens
 * without a piece symbol (pawn moves, castling) keep their spelling, and so do
 * figurines the book wrote when figurines are chosen.
 */
export function formatMoveToken(raw: string, san: string | undefined, lang: AppLanguage, style: NotationStyle): string {
  const [, num = '', body] = NUMBER.exec(raw)!
  if (!san) return num + formatSan(body, lang, style)
  const piece = pieceIn(san[0])
  let out = body
  const written = [...body][0] ?? ''
  // A book already written with figurines keeps its own glyphs when figurines are chosen.
  const keep = style === 'figurine' && written in FIGURINE_PIECE
  if (piece && !keep && WRITTEN_PIECE.test(body)) out = pieceOut(piece, lang, style) + body.slice(written.length)
  const promo = /=([QRBN])/.exec(san)
  if (promo) out = out.replace(/=[QRBNDTACSL♔♕♖♗♘♚♛♜♝♞]/u, `=${pieceOut(promo[1] as Piece, lang, style)}`)
  return num + out
}

/** Re-format the move spans the reader painted (`span[data-san]`); their book spelling is kept in `data-raw`. */
export function formatMoveSpans(root: ParentNode, lang: AppLanguage, style: NotationStyle): void {
  root.querySelectorAll<HTMLElement>('span[data-san]').forEach((span) => {
    const raw = span.getAttribute('data-raw') ?? span.textContent ?? ''
    if (!span.hasAttribute('data-raw')) span.setAttribute('data-raw', raw)
    const shown = formatMoveToken(raw, span.getAttribute('data-san') ?? undefined, lang, style)
    if (span.textContent !== shown) span.textContent = shown
  })
}

/** The current language and notation, with formatters bound to them (re-render on change). */
export function useNotation() {
  const lang = useSettingsStore((s) => s.language)
  const style = useSettingsStore((s) => s.notationStyle)
  const san = useCallback((m: string) => formatSan(m, lang, style), [lang, style])
  const line = useCallback((t: string) => formatLine(t, lang, style), [lang, style])
  const token = useCallback((raw: string, canonical?: string) => formatMoveToken(raw, canonical, lang, style), [lang, style])
  return { lang, style, san, line, token }
}
