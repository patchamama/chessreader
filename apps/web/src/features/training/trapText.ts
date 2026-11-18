import { Chess } from 'chess.js'
import { playLine, type LinePosition } from '../../shared/chess/playLine'
import { squareLine } from '../library/utils/squareLine'
import type { Trap } from './traps'

/** A piece of the idea text of a trap: plain text, a line of moves, or squares it names. */
export type IdeaSegment =
  | { kind: 'text'; text: string }
  | { kind: 'line'; text: string; numbers: (string | null)[]; startFen: string; positions: LinePosition[] }
  | { kind: 'square'; text: string; squares: string[] }

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

/** The positions of the trap line: before each move and after the last. */
function trapFens(trap: Trap): string[] {
  const c = new Chess()
  const fens = [c.fen()]
  for (const san of trap.sans) { try { c.move(san) } catch { break } fens.push(c.fen()) }
  return fens
}

/** Plays a run of written moves from the trap position its move number names, else from any of the trap's positions. */
function resolveRun(run: MoveToken[], fens: string[], lang: string): { startFen: string; positions: LinePosition[] } | null {
  const first = run[0]
  const order: number[] = []
  if (first.numbered && first.number) order.push((Number(first.number) - 1) * 2 + (first.black ? 1 : 0))
  fens.forEach((_f, i) => order.push(i))
  for (const letters of lang === 'en' ? [null] : [lang, null]) {
    const sans = run.map((t) => toSan(t.raw, letters))
    for (const ply of order) {
      const fen = fens[ply]
      if (!fen) continue
      const { positions, ok } = playLine(fen, sans)
      if (ok && positions.length === sans.length) return { startFen: fen, positions }
    }
  }
  return null
}

/**
 * The idea text of a trap cut into plain text, lines of moves (replayable from
 * the trap's line, in the language the text is written in) and the squares and
 * lines of squares it names ("ataque a f7", "la diagonal a2-g8").
 */
export function ideaSegments(text: string, trap: Trap, textLang: string): IdeaSegment[] {
  const fens = trapFens(trap)
  const out: IdeaSegment[] = []
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
    if (bare) { out.push({ kind: 'square', text: raw, squares: [r[0].raw] }); return }
    const line = resolveRun(r, fens, textLang)
    if (line) out.push({ kind: 'line', text: raw, numbers: r.map((t) => (t.numbered ? `${t.number}${t.black ? '...' : '.'}` : null)), ...line })
    else pushText(raw)
  }
  for (const m of text.matchAll(TOKEN)) {
    const start = m.index ?? 0
    const between = text.slice(at, start)
    if (run.length && !/^\s*$/.test(between)) flush()
    if (m[1] && m[2]) {
      flush()
      pushText(between)
      const squares = squareLine(m[1], m[2])
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
