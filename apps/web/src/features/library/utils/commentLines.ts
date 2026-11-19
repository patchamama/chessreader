import { Chess, type Move } from 'chess.js'

/**
 * The moves a book comment quotes (S7), as playable lines with the markup of
 * utils/lineMarkup (`chess-line` / `line-move`), whatever notation the comment
 * is written in: a remark taken from another book may use English letters in a
 * Spanish chapter ("con 5…Nc6"), German, French or figurines. Each run of moves
 * is tried in every notation from the positions it may speak of, and the
 * notation that plays the most moves wins:
 *  - a numbered run ("5…Nc6", "6.Ad3") first from the main line's position
 *    before that move ("5…" → before Black's 5th move);
 *  - then from the commented position;
 *  - then right after the line quoted before it.
 */

/** Position before each main-line move, keyed "5b" (before Black's 5th move) or "6w". */
export type MainLinePositions = ReadonlyMap<string, string>

type Notation = 'en' | 'es' | 'de' | 'fr'

const LETTERS: Record<Notation, Record<string, string>> = {
  en: { K: 'K', Q: 'Q', R: 'R', B: 'B', N: 'N' },
  es: { K: 'R', Q: 'D', R: 'T', B: 'A', N: 'C' },
  de: { K: 'K', Q: 'D', R: 'T', B: 'L', N: 'S' },
  fr: { K: 'R', Q: 'D', R: 'T', B: 'F', N: 'C' },
}
const NOTATIONS = Object.keys(LETTERS) as Notation[]
const FIGURINES: Record<string, string> = { '♔': 'K', '♚': 'K', '♕': 'Q', '♛': 'Q', '♖': 'R', '♜': 'R', '♗': 'B', '♝': 'B', '♘': 'N', '♞': 'N' }

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
const escAttr = (s: string) => esc(s).replace(/"/g, '&quot;')

/** A SAN in a notation's letters, without check marks or glyphs. */
const localise = (san: string, n: Notation) =>
  san.replace(/[+#]/g, '').replace(/^[KQRBN]/, (c) => LETTERS[n][c]).replace(/=([QRBN])/, (_m, c: string) => `=${LETTERS[n][c]}`)

/** "Cf6!?" → "Cf6", "0-0+" → "O-O", "♘f3" → "Nf3" (figurines read as English). */
const normalise = (token: string) =>
  token.replace(/[!?]+$/, '').replace(/[+#]+$/, '').replace(/^[♔♚♕♛♖♜♗♝♘♞]/, (c) => FIGURINES[c]).replace(/0/g, 'O').replace(/:/g, 'x')

function resolve(chess: Chess, token: string, n: Notation): Move | null {
  const t = normalise(token)
  const moves = chess.moves({ verbose: true })
  const hit = moves.find((m) => localise(m.san, n) === t) ?? moves.find((m) => localise(m.san, n).replace('x', '') === t.replace('x', ''))
  return hit ? chess.move(hit.san) : null
}

// An optional move number ("12.", "12...", "12…") and a move in any notation's letters.
const MOVE_RE = /(?<![\wÀ-ɏ])(?:(\d+)\s*(\.\.\.|…|\.)\s*)?((?:[KQRBNDTACLSF♔♕♖♗♘♚♛♜♝♞]?[a-h]?[1-8]?[x:]?[a-h][1-8](?:=?[QRBNDTACLSF])?|[O0]-[O0](?:-[O0])?)[+#]?[!?]*)(?![\wÀ-ɏ])/gu

interface Token { start: number; end: number; sanStart: number; san: string; number?: number; black?: boolean }

function tokens(text: string): Token[] {
  return [...text.matchAll(MOVE_RE)].map((m) => ({
    start: m.index!, end: m.index! + m[0].length, sanStart: m.index! + m[0].length - m[3].length, san: m[3],
    ...(m[1] !== undefined ? { number: Number(m[1]), black: m[2] !== '.' } : {}),
  }))
}

/** The SANs of a run played from a position in one notation, as far as they are legal, and the position reached. */
function play(fen: string, run: Token[], n: Notation): { sans: string[]; end: string } {
  let chess: Chess
  try { chess = new Chess(fen) } catch { return { sans: [], end: fen } }
  const sans: string[] = []
  for (const t of run) {
    const m = resolve(chess, t.san, n)
    if (!m) break
    sans.push(m.san)
  }
  return { sans, end: chess.fen() }
}

/** The notations most likely used by a text first (it only breaks ties between equally long readings). */
function likelyNotations(text: string): Notation[] {
  const count = (re: RegExp) => (text.match(re) ?? []).length
  const score: Record<Notation, number> = {
    en: count(/(?:^|[\s(.…])[NBQ][a-h]?[1-8]?x?[a-h][1-8]/g),
    es: count(/(?:^|[\s(.…])[CAD][a-h]?[1-8]?x?[a-h][1-8]/g),
    de: count(/(?:^|[\s(.…])[SL][a-h]?[1-8]?x?[a-h][1-8]/g),
    fr: count(/(?:^|[\s(.…])F[a-h]?[1-8]?x?[a-h][1-8]/g),
  }
  return [...NOTATIONS].sort((a, b) => score[b] - score[a])
}

function runHtml(text: string, fen: string, run: Token[], sans: string[]): string {
  let html = `<span class="chess-line" data-line-start="${escAttr(fen)}" data-line-moves="${escAttr(sans.join(' '))}">`
  let at = run[0].start
  run.slice(0, sans.length).forEach((t, i) => {
    html += esc(text.slice(at, t.sanStart))
    html += `<span class="line-move" data-ply="${i + 1}">${esc(t.san)}</span>`
    at = t.end
  })
  return `${html}</span>`
}

/**
 * A book comment's text as HTML, with every run of moves it quotes that can be
 * played marked as a line. Lone square names ("la casilla d5"), ordinals and
 * moves no notation can play stay text.
 */
export function markCommentMoves(text: string, fen: string, mainLine?: MainLinePositions): string {
  const order = likelyNotations(text)
  // Runs: moves separated only by spaces or commas.
  const runs: Token[][] = []
  for (const t of tokens(text)) {
    const run = runs.at(-1)
    if (run && /^[\s,;]*$/.test(text.slice(run.at(-1)!.end, t.start))) run.push(t)
    else runs.push([t])
  }
  let html = ''
  let at = 0
  let previousEnd: string | null = null
  for (const run of runs) {
    const first = run[0]
    if (run.length === 1 && first.number === undefined && /^[a-h][1-8]$/.test(first.san)) continue
    const numbered = first.number !== undefined ? mainLine?.get(`${first.number}${first.black ? 'b' : 'w'}`) : undefined
    const starts: string[] = [...new Set([numbered, fen, previousEnd].filter((s): s is string => !!s))]
    let best: { start: string; sans: string[]; end: string } | null = null
    for (const start of starts) {
      for (const n of order) {
        const tried = play(start, run, n)
        if (tried.sans.length > (best?.sans.length ?? 0)) best = { start, ...tried }
      }
      if (best?.sans.length === run.length) break
    }
    if (!best) continue
    html += esc(text.slice(at, first.start)) + runHtml(text, best.start, run, best.sans)
    at = run[best.sans.length - 1].end
    previousEnd = best.end
  }
  return html + esc(text.slice(at))
}
