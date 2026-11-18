import { Chess, type Move } from 'chess.js'

/**
 * Line markup (S5, S9): the moves of a variation, an engine line or a book
 * comment as a playable line the reader can show as thumbnails, replay and
 * narrate:
 *   <span class="chess-line" data-line-start="FEN" data-line-moves="SAN SAN …">
 *     2... <span class="line-move" data-ply="1">Cf6</span> 3. <span class="line-move" data-ply="2">Cxe5</span>
 *   </span>
 * The visible text keeps the book's own letters; data-line-moves is English SAN.
 */

export type PieceLang = 'en' | 'es' | 'de'

const LETTERS: Record<PieceLang, Record<string, string>> = {
  en: { K: 'K', Q: 'Q', R: 'R', B: 'B', N: 'N' },
  es: { K: 'R', Q: 'D', R: 'T', B: 'A', N: 'C' },
  de: { K: 'K', Q: 'D', R: 'T', B: 'L', N: 'S' },
}
const FIGURINES: Record<string, string> = { '♔': 'K', '♚': 'K', '♕': 'Q', '♛': 'Q', '♖': 'R', '♜': 'R', '♗': 'B', '♝': 'B', '♘': 'N', '♞': 'N' }

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
const escAttr = (s: string) => esc(s).replace(/"/g, '&quot;')

/** A SAN written with a language's piece letters, without check marks or glyphs. */
const localise = (san: string, lang: PieceLang) =>
  san.replace(/[+#]/g, '').replace(/^[KQRBN]/, (c) => LETTERS[lang][c]).replace(/=([QRBN])/, (_m, c: string) => `=${LETTERS[lang][c]}`)

/** "Cf6!?" → "Cf6", "0-0+" → "O-O", "♘f3" → "Nf3". */
const normalise = (token: string) =>
  token.replace(/[!?]+$/, '').replace(/[+#]+$/, '').replace(/^[♔♚♕♛♖♜♗♝♘♞]/, (c) => FIGURINES[c]).replace(/0/g, 'O').replace(/:/g, 'x')

/** The languages a text's moves are written in, most likely first (Spanish R is the king, English R the rook). */
export function guessPieceLangs(text: string): PieceLang[] {
  const count = (re: RegExp) => (text.match(re) ?? []).length
  const es = count(/(?:^|[\s(.])[CAD][a-h]?[1-8]?x?[a-h][1-8]/g)
  const de = count(/(?:^|[\s(.])[SL][a-h]?[1-8]?x?[a-h][1-8]/g)
  const en = count(/(?:^|[\s(.])[NBQ][a-h]?[1-8]?x?[a-h][1-8]/g)
  const order: Array<[PieceLang, number]> = [['en', en], ['es', es], ['de', de]]
  return order.sort((a, b) => b[1] - a[1]).map(([l]) => l)
}

/** The legal move a token stands for, in the preferred languages' letters first; null when none. */
export function resolveSan(chess: Chess, token: string, prefer: PieceLang[] = ['en', 'es', 'de']): Move | null {
  const t = normalise(token)
  const moves = chess.moves({ verbose: true })
  for (const lang of prefer) {
    const hit = moves.find((m) => localise(m.san, lang) === t) ?? moves.find((m) => localise(m.san, lang).replace('x', '') === t.replace('x', ''))
    if (hit) return chess.move(hit.san)
  }
  return null
}

// An optional move number ("12.", "12...", "12…") and a move in any book letters.
const MOVE_RE = /(?<![\wÀ-ɏ])(?:(\d+)\s*(?:\.\.\.|…|\.)\s*)?((?:[KQRBNDTACLS♔♕♖♗♘♚♛♜♝♞]?[a-h]?[1-8]?[x:]?[a-h][1-8](?:=?[QRBNDTACLS])?|[O0]-[O0](?:-[O0])?)[+#]?[!?]*)(?![\wÀ-ɏ])/gu

interface Token { start: number; end: number; sanStart: number; san: string; numbered: boolean }

function tokens(text: string): Token[] {
  return [...text.matchAll(MOVE_RE)].map((m) => ({
    start: m.index!, end: m.index! + m[0].length, sanStart: m.index! + m[0].length - m[2].length, san: m[2], numbered: m[1] !== undefined,
  }))
}

/** Play the tokens from a position as long as they are legal: the SANs played. */
function play(fen: string, run: Token[], prefer: PieceLang[]): string[] {
  let chess: Chess
  try { chess = new Chess(fen) } catch { return [] }
  const played: string[] = []
  for (const t of run) {
    const m = resolveSan(chess, t.san, prefer)
    if (!m) break
    played.push(m.san)
  }
  return played
}

/** The HTML of a playable run: numbers as plain text, one line-move span per move. */
function runHtml(text: string, fen: string, run: Token[], sans: string[]): string {
  const used = run.slice(0, sans.length)
  let html = `<span class="chess-line" data-line-start="${escAttr(fen)}" data-line-moves="${escAttr(sans.join(' '))}">`
  let at = used[0].start
  used.forEach((t, i) => {
    html += esc(text.slice(at, t.sanStart))
    html += `<span class="line-move" data-ply="${i + 1}">${esc(t.san)}</span>`
    at = t.end
  })
  return `${html}</span>`
}

/**
 * A text that IS a line (a variation in parentheses, an engine line under a
 * diagram): its moves from `startFen` as one chess-line, up to the first move
 * that cannot be played. Null when not even the first move can be played.
 */
export function markLine(text: string, startFen: string, prefer?: PieceLang[]): string | null {
  const run = tokens(text)
  if (!run.length) return null
  const sans = play(startFen, run, prefer ?? guessPieceLangs(text))
  if (!sans.length) return null
  const last = run[sans.length - 1]
  return esc(text.slice(0, run[0].start)) + runHtml(text, startFen, run, sans) + esc(text.slice(last.end))
}

/** The final position after playing a line, or null. */
function fenAfter(fen: string, sans: string[]): string | null {
  try {
    const c = new Chess(fen)
    for (const s of sans) c.move(s)
    return c.fen()
  } catch { return null }
}

/**
 * Prose (a book comment) with the moves it quotes marked as lines when they
 * can be played from the comment's position — or right after the line quoted
 * before them. Lone square names ("the square d5") and illegal moves stay text.
 */
export function markProseMoves(text: string, fen: string, prefer?: PieceLang[]): string {
  const all = tokens(text)
  const langs = prefer ?? guessPieceLangs(text)
  // Runs: moves separated only by spaces or commas.
  const runs: Token[][] = []
  for (const t of all) {
    const run = runs.at(-1)
    if (run && /^[\s,;]*$/.test(text.slice(run.at(-1)!.end, t.start))) run.push(t)
    else runs.push([t])
  }
  let html = ''
  let at = 0
  let previousEnd: string | null = null
  for (const run of runs) {
    const first = run[0]
    // A bare square ("d5") alone is a square name, not a move.
    if (run.length === 1 && !first.numbered && /^[a-h][1-8]$/.test(first.san)) continue
    let start = fen
    let sans = play(start, run, langs)
    if (!sans.length && previousEnd) { start = previousEnd; sans = play(start, run, langs) }
    if (!sans.length) continue
    html += esc(text.slice(at, first.start)) + runHtml(text, start, run, sans)
    at = run[sans.length - 1].end
    previousEnd = fenAfter(start, sans)
  }
  return html + esc(text.slice(at))
}

/** A button that sends a line (or just a position) to a new analysis board; the recogniser skips it. */
export function lineToBoardButton(fen: string, moves: string[]): string {
  const label = 'Open on a new analysis board'
  return `<button type="button" class="line-to-board" data-no-recognition data-line-start="${escAttr(fen)}" data-line-moves="${escAttr(moves.join(' '))}" aria-label="${label}" title="${label}">⊞</button>`
}

/** The SAN moves of a line written in any book letters, from a position (as far as they can be played). */
export function lineSans(text: string, fen: string, prefer?: PieceLang[]): string[] {
  return play(fen, tokens(text), prefer ?? guessPieceLangs(text))
}
