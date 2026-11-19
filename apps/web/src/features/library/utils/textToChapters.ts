import { pgnToChapters } from '../../gamesearch/pgnChapters'
import type { Chapter } from '../api/libraryApi'
import { boardSvgDataUrl } from './boardSvg'
import { parseCommentMark, parseDiagramMark, type CommentMark } from './diagramMark'
import { Chess } from 'chess.js'
import { guessPieceLangs, lineSans, lineToBoardButton, markLine, resolveSan, type PieceLang } from './lineMarkup'
import { markCommentMoves, type MainLinePositions } from './commentLines'

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
const attr = (s: string) => esc(s).replace(/"/g, '&quot;')

/**
 * Pasted text as a book the reader can open: PGN (tag pairs) becomes one
 * chapter per game; anything else is one chapter, one paragraph per line or
 * block — the same shape the recogniser reads from an EPUB.
 */
export function textToChapters(text: string, title?: string): { title: string; chapters: Chapter[] } {
  const clean = text.replace(/\r/g, '').trim()
  if (!clean) return { title: title?.trim() || '', chapters: [] }
  if (/^\[\w+ "[^"]*"\]/m.test(clean)) {
    const { chapters } = pgnToChapters(clean)
    if (chapters.length > 0) return { title: title?.trim() || chapters[0].title, chapters }
  }
  const paragraphs = clean.split(/\n+/).map((p) => p.trim()).filter(Boolean)
  const name = title?.trim() || paragraphs[0].slice(0, 80)
  const html = textToHtml(clean)
  return { title: name, chapters: [{ title: name, html, toc: [{ order: 1, title: name }] }] }
}

/**
 * Text (commentary, a game) as the HTML of a chapter: one paragraph per line,
 * variations as playable lines, diagram and book comment marks rendered.
 */
export function textToHtml(text: string): string {
  const clean = text.replace(/\r/g, '').trim()
  const book = new Book(guessPieceLangs(clean))
  return clean.split(/\n+/).map((p) => p.trim()).filter(Boolean).map((p) => book.paragraph(p)).join('\n')
}

/**
 * The inside of a book comment quote: its text (with the moves it quotes
 * playable from `fen`) and a footer with its source and a link to it.
 */
export function humanCommentInner(
  quote: Pick<CommentMark, 'text' | 'source' | 'fen' | 'gameId' | 'ply'>,
  mainLine?: MainLinePositions,
): string {
  // Moves are read in whatever notation the quote uses (S7), anchored on the
  // game's main line when they carry a number ("5…Nc6"), else on the quote's position.
  const text = quote.fen ? markCommentMoves(quote.text, quote.fen, mainLine) : esc(quote.text)
  const link = quote.gameId
    ? ` <a class="comment-source" data-comment-game="${attr(quote.gameId)}" data-comment-ply="${quote.ply ?? ''}" href="#" aria-label="Open the source of this comment" title="Open the source of this comment">↗</a>`
    : ''
  const footer = quote.source || link ? `<footer>${quote.source ? `— ${esc(quote.source)}` : ''}${link}</footer>` : ''
  return `<p>${text}</p>${footer}`
}

// A paragraph made only of move numbers, moves and glyphs: a line of the game.
const MOVE_LINE = /^(?:\d+\s*(?:\.\.\.|…|\.)\s*|(?:[KQRBNDTACLS♔♕♖♗♘♚♛♜♝♞]?[a-h]?[1-8]?[x:]?[a-h][1-8](?:=?[QRBNDTACLS])?|[O0]-[O0](?:-[O0])?)[+#]?[!?]*\s*|[!?]+\s*)+$/u
// A variation on its own line: "(2... Cf6 3. Cxe5 d6)".
const VARIATION = /^\(\s*(\d+)\s*(\.\.\.|…|\.)\s*.*\)$/u

/**
 * Paragraphs of a text in reading order, following the game's moves line by
 * line so that a variation written on its own line ("(2... Cf6 3. Cxe5)", as
 * the commentary prints them) knows the position it starts from.
 */
class Book {
  private chess: Chess | null = null
  /** Position before each move of the game: "2b" → before Black's 2nd move. */
  private before = new Map<string, string>()

  constructor(private langs: PieceLang[]) {}

  private follow(p: string) {
    // "1. …" (White's first move) starts a game again.
    if (/^1\.(?!\.)/.test(p) || !this.chess) { this.chess = new Chess(); this.before.clear() }
    for (const [, san] of p.matchAll(/(?:\d+\s*(?:\.\.\.|…|\.)\s*)?(\S+)/gu)) {
      if (/^[!?]+$/.test(san)) continue
      const key = `${this.chess.moveNumber()}${this.chess.turn()}`
      const fen = this.chess.fen()
      if (!resolveSan(this.chess, san, this.langs)) { this.chess = null; return }
      this.before.set(key, fen)
    }
  }

  paragraph(p: string): string {
    if (MOVE_LINE.test(p)) this.follow(p)
    const variation = VARIATION.exec(p)
    if (variation) {
      const start = this.before.get(`${variation[1]}${variation[2] === '.' ? 'w' : 'b'}`)
      const marked = start ? markLine(p, start, this.langs) : null
      if (marked) return `<p class="variation" data-no-recognition>${marked}</p>`
    }
    return paragraph(p, this.langs, this.before)
  }
}

/**
 * The main-line positions the remarks of a quote may speak of ("5…Nc6" → "5b"),
 * kept on the quote so a remark picked again later reads its moves against the
 * main line too (S7). Null when none is quoted or known.
 */
function mainLineFor(texts: string[], before?: MainLinePositions): Record<string, string> | null {
  if (!before?.size) return null
  const out: Record<string, string> = {}
  for (const text of texts) {
    for (const [, n] of text.matchAll(/(\d+)\s*(?:\.\.\.|…|\.)/gu)) {
      for (const key of [`${n}w`, `${n}b`]) {
        const fen = before.get(key)
        if (fen) out[key] = fen
      }
    }
  }
  return Object.keys(out).length ? out : null
}

/** The main-line positions kept on a quote by the commentary (see mainLineFor). */
export function readCommentMainLine(json: string | null): MainLinePositions | undefined {
  if (!json) return undefined
  try {
    const parsed = JSON.parse(json) as unknown
    if (!parsed || typeof parsed !== 'object') return undefined
    return new Map(Object.entries(parsed as Record<string, unknown>).filter((e): e is [string, string] => typeof e[1] === 'string'))
  } catch {
    return undefined
  }
}

/**
 * A diagram mark written by the commentary (`[Diagram fen="…" eval="…" line="…" alt="…"]`)
 * or a plain paragraph. The engine's lines under a diagram are marked so the
 * recogniser does not read them as moves of the game.
 */
function paragraph(p: string, langs: PieceLang[], before?: MainLinePositions): string {
  // A remark borrowed from a book: a quote with its source (its moves are not the game's).
  const quote = parseCommentMark(p)
  if (quote) {
    // Every remark of the position is kept, so the reader can pick another one (S4).
    const mainLine = quote.alternatives ? mainLineFor(quote.alternatives.map((a) => a.text), before) : null
    const alternatives = quote.alternatives
      ? ` data-comment-alternatives="${attr(JSON.stringify(quote.alternatives))}"${quote.fen ? ` data-comment-fen="${attr(quote.fen)}"` : ''}`
        + (mainLine ? ` data-comment-mainline="${attr(JSON.stringify(mainLine))}"` : '')
      : ''
    return `<blockquote class="human-comment" data-no-recognition${alternatives}>${humanCommentInner(quote, before)}</blockquote>`
  }
  const mark = parseDiagramMark(p)
  if (!mark) return `<p>${esc(p)}</p>`
  const out = [`<img class="diagram" src="${boardSvgDataUrl(mark.fen)}" alt="Diagram" data-fen="${esc(mark.fen)}">`]
  // The evaluation is not replayed nor narrated: a button takes the engine's line to an analysis board.
  if (mark.eval) out.push(`<p class="diagram-eval">${esc(mark.eval)} ${lineToBoardButton(mark.fen, mark.line ? lineSans(mark.line, mark.fen, langs) : [])}</p>`)
  if (mark.line) out.push(`<p class="diagram-line" data-no-recognition>${markLine(mark.line, mark.fen, langs) ?? esc(mark.line)}</p>`)
  if (mark.alt) out.push(`<p class="diagram-line diagram-alt" data-no-recognition>${markLine(mark.alt, mark.fen, langs) ?? esc(mark.alt)}</p>`)
  return out.join('\n')
}
