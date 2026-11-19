import { Chess } from 'chess.js'
import { playLine, type LinePosition } from '../chess/playLine'

/** A piece of a text: plain text, a line of moves (legal from a known position), or squares it names. */
export type NotationSegment =
  | { kind: 'text'; text: string }
  | { kind: 'line'; text: string; numbers: (string | null)[]; startFen: string; positions: LinePosition[] }
  | { kind: 'square'; text: string; squares: string[] }

export interface NotationOptions {
  /** Bare squares ("f7") become square segments; otherwise they stay text. */
  squares?: boolean
  /** The squares of a written pair ("a2-g8"); null keeps it as text. Without it, pairs stay text. */
  squarePair?: (from: string, to: string) => string[] | null
}

const W = '[\\wÀ-ɏ]'
const MOVE = '(?:[KQRBNDTACLS♔♕♖♗♘♚♛♜♝♞]?[a-h]?[1-8]?[x:]?[a-h][1-8](?:=?[QRBNDTACLS])?|[O0]-[O0](?:-[O0])?)[+#]?[!?]*'
const TOKEN = new RegExp(`(?<!${W})(?:([a-h][1-8])[-–]([a-h][1-8])|(?:(\\d{1,3})\\s*(\\.\\.\\.|…|\\.)\\s*)?(${MOVE}))(?!${W})`, 'gu')

const LETTERS: Record<string, Record<string, string>> = {
  es: { R: 'K', D: 'Q', T: 'R', A: 'B', C: 'N' },
  de: { K: 'K', D: 'Q', T: 'R', L: 'B', S: 'N' },
}
const FIGURINE: Record<string, string> = { '♔': 'K', '♚': 'K', '♕': 'Q', '♛': 'Q', '♖': 'R', '♜': 'R', '♗': 'B', '♝': 'B', '♘': 'N', '♞': 'N' }

/** A move as written in the text, in English SAN (letters of `lang` when given). */
function toSan(raw: string, lang: string | null): string {
  let s = raw.replace(/[!?]+$/, '').replace(/0/g, 'O').replace(':', 'x')
  const fig = FIGURINE[s[0]]
  if (fig) s = fig + s.slice(1)
  const map = lang ? LETTERS[lang] : undefined
  if (map) s = s.replace(/^[A-Z]/, (c) => map[c] ?? c).replace(/=([A-Z])/, (_m, c: string) => `=${map[c] ?? c}`)
  return s
}

interface MoveToken { start: number; end: number; raw: string; number: string | null; black: boolean; numbered: boolean }

/**
 * Plays a run of written moves: from the position its move number names
 * (`fens[i]` is the position after `i` half-moves), else from any of `fens`,
 * else from a position an earlier line of the text reached.
 */
function resolveRun(run: MoveToken[], fens: string[], reached: string[], lang: string): { startFen: string; positions: LinePosition[] } | null {
  const first = run[0]
  const order: string[] = []
  if (first.numbered && first.number) {
    const at = fens[(Number(first.number) - 1) * 2 + (first.black ? 1 : 0)]
    if (at) order.push(at)
  }
  order.push(...fens, ...reached)
  for (const letters of lang === 'en' ? [null] : [lang, null]) {
    const sans = run.map((t) => toSan(t.raw, letters))
    for (const fen of order) {
      const { positions, ok } = playLine(fen, sans)
      if (ok && positions.length === sans.length) return { startFen: fen, positions }
    }
  }
  return null
}

/**
 * A text cut into plain text and the lines of chess moves it writes ("1. e4 e5
 * 2. Nf3", Spanish or German letters, figurines), each line legal from one of
 * `fens` (by default the start position) or from where an earlier line of the
 * text ended. What is not a legal move stays text.
 */
export function notationSegments(text: string, textLang: string, fens: string[] = [new Chess().fen()], options: NotationOptions = {}): NotationSegment[] {
  const out: NotationSegment[] = []
  const reached: string[] = []
  let at = 0
  const pushText = (s: string) => {
    if (!s) return
    const last = out[out.length - 1]
    if (last?.kind === 'text') last.text += s
    else out.push({ kind: 'text', text: s })
  }
  let run: MoveToken[] = []
  const flush = () => {
    if (!run.length) return
    const r = run
    run = []
    const raw = text.slice(r[0].start, r[r.length - 1].end)
    const bare = r.length === 1 && !r[0].numbered && /^[a-h][1-8]$/.test(r[0].raw)
    if (bare) {
      if (options.squares) out.push({ kind: 'square', text: raw, squares: [r[0].raw] })
      else pushText(raw)
      return
    }
    const line = resolveRun(r, fens, reached, textLang)
    if (!line) { pushText(raw); return }
    out.push({ kind: 'line', text: raw, numbers: r.map((t) => (t.numbered ? `${t.number}${t.black ? '...' : '.'}` : null)), ...line })
    reached.push(...line.positions.map((p) => p.fen))
  }
  for (const m of text.matchAll(TOKEN)) {
    const start = m.index ?? 0
    const between = text.slice(at, start)
    if (run.length && !/^\s*$/.test(between)) flush()
    if (m[1] && m[2]) {
      flush()
      pushText(between)
      const squares = options.squarePair?.(m[1], m[2])
      if (squares) out.push({ kind: 'square', text: m[0], squares })
      else pushText(m[0])
      at = start + m[0].length
      continue
    }
    if (!run.length) pushText(between)
    const dots = m[4] ?? ''
    run.push({ start, end: start + m[0].length, raw: m[5], number: m[3] ?? null, numbered: !!m[3], black: dots === '...' || dots === '…' })
    at = start + m[0].length
  }
  flush()
  pushText(text.slice(at))
  return out
}
