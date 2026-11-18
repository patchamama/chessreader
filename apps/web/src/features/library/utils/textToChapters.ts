import { pgnToChapters } from '../../gamesearch/pgnChapters'
import type { Chapter } from '../api/libraryApi'
import { boardSvgDataUrl } from './boardSvg'
import { parseCommentMark, parseDiagramMark } from './diagramMark'
import { Chess } from 'chess.js'
import { guessPieceLangs, lineSans, lineToBoardButton, markLine, markProseMoves, resolveSan, type PieceLang } from './lineMarkup'

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
  const book = new Book(guessPieceLangs(clean))
  const html = paragraphs.map((p) => book.paragraph(p)).join('\n')
  return { title: name, chapters: [{ title: name, html, toc: [{ order: 1, title: name }] }] }
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
    return paragraph(p, this.langs)
  }
}

/**
 * A diagram mark written by the commentary (`[Diagram fen="…" eval="…" line="…" alt="…"]`)
 * or a plain paragraph. The engine's lines under a diagram are marked so the
 * recogniser does not read them as moves of the game.
 */
function paragraph(p: string, langs: PieceLang[]): string {
  // A remark borrowed from a book: a quote with its source (its moves are not the game's).
  const quote = parseCommentMark(p)
  if (quote) {
    const text = quote.fen ? markProseMoves(quote.text, quote.fen, guessPieceLangs(quote.text)) : esc(quote.text)
    const link = quote.gameId
      ? ` <a class="comment-source" data-comment-game="${attr(quote.gameId)}" data-comment-ply="${quote.ply ?? ''}" href="#" aria-label="Open the source of this comment" title="Open the source of this comment">↗</a>`
      : ''
    const footer = quote.source || link ? `<footer>${quote.source ? `— ${esc(quote.source)}` : ''}${link}</footer>` : ''
    return `<blockquote class="human-comment" data-no-recognition><p>${text}</p>${footer}</blockquote>`
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
