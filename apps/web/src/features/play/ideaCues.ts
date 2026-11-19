import { Chess } from 'chess.js'
import { analyseComment, type BoardCue } from '@chess-ebook/chess-shared'
import { cuesToBoard, type CueBoard } from '../library/narration/cueStyles'

/** Piece letters of each language, to English SAN. */
const TO_EN: Record<string, Record<string, string>> = {
  en: { K: 'K', Q: 'Q', R: 'R', B: 'B', N: 'N' },
  es: { R: 'K', D: 'Q', T: 'R', A: 'B', C: 'N' },
  de: { K: 'K', D: 'Q', T: 'R', L: 'B', S: 'N' },
}
const MOVE_RE = /(?<![\wÀ-ɏ])(O-O(?:-O)?|0-0(?:-0)?|[KQRBNDTACLS]?[a-h]?[1-8]?x?[a-h][1-8](?:=?[QRBNDTACLS])?[+#]?)(?![\wÀ-ɏ])/g

function toMove(token: string, fen: string, lang?: string): { from: string; to: string } | null {
  const order = [lang, 'en', 'es', 'de'].filter((l, i, a): l is string => !!l && !!TO_EN[l] && a.indexOf(l) === i)
  for (const l of order) {
    const map = TO_EN[l]
    const san = token.replace(/^0-0-0/, 'O-O-O').replace(/^0-0/, 'O-O')
      .replace(/^([KQRBNDTACLS])/, (c) => map[c] ?? '?')
      .replace(/([a-h][18])=?([QRBNDTACLS])([+#]?)$/, (_m, sq: string, c: string, s: string) => `${sq}=${map[c] ?? '?'}${s}`)
    if (san.includes('?')) continue
    try {
      const mv = new Chess(fen).move(san)
      return { from: mv.from, to: mv.to }
    } catch { /* not a move in this language here */ }
  }
  return null
}

/** The moves named in the text that can be played in `fen`, as board cues (arrow + from/to squares). */
const FIGURINE: Record<string, string> = { '♔': 'K', '♕': 'Q', '♖': 'R', '♗': 'B', '♘': 'N', '♚': 'K', '♛': 'Q', '♜': 'R', '♝': 'B', '♞': 'N' }

function moveCues(text: string, fen: string, lang?: string): BoardCue[] {
  const out: BoardCue[] = []
  // Figurines read as English letters (one character each: the offsets stay).
  const letters = text.replace(/[♔♕♖♗♘♚♛♜♝♞]/g, (c) => FIGURINE[c])
  for (const m of letters.matchAll(MOVE_RE)) {
    const token = m[1]
    const start = m.index ?? 0
    // A bare square ("c7") is a pawn move only at the start of a sentence or after a colon or a move number.
    if (/^[a-h][1-8]$/.test(token) && !/(^|[:.]\s*|\d\.+\s*)$/.test(text.slice(0, start))) continue
    const mv = toMove(token, fen, /[♔-♞]/.test(text.slice(start, start + 1)) ? 'en' : lang)
    if (!mv) continue
    out.push({
      kind: 'move', label: token, start, end: start + token.length,
      squares: [{ square: mv.from, role: 'from' }, { square: mv.to, role: 'to' }],
      arrows: [{ from: mv.from, to: mv.to, role: 'good' }],
    })
  }
  return out
}

/** Every cue of the text that shows something on the board, without overlaps, in text order. */
function allCues(text: string, fen: string, lang?: string): BoardCue[] {
  let comment: BoardCue[] = []
  try { comment = analyseComment(text, fen) } catch { /* not a position the analyser can read */ }
  const cues = [...moveCues(text, fen, lang), ...comment.filter((c) => c.squares.length || c.arrows.length)]
    .sort((a, b) => a.start - b.start || (b.end - b.start) - (a.end - a.start))
  const kept: BoardCue[] = []
  for (const c of cues) if (!kept.some((k) => c.start < k.end && k.start < c.end)) kept.push(c)
  return kept
}

/** What a tutor idea shows on the board: arrows for its moves, colours for the squares and pieces it names. */
export function ideaCues(text: string, fen: string, lang?: string): CueBoard {
  return cuesToBoard(allCues(text, fen, lang))
}

export interface IdeaSegment { text: string; board?: CueBoard }

/** The text in parts: each move or square it names carries what hovering it shows on the board. */
export function ideaSegments(text: string, fen: string, lang?: string): IdeaSegment[] {
  const out: IdeaSegment[] = []
  let at = 0
  for (const c of allCues(text, fen, lang)) {
    if (c.start > at) out.push({ text: text.slice(at, c.start) })
    out.push({ text: text.slice(c.start, c.end), board: cuesToBoard([c]) })
    at = c.end
  }
  if (at < text.length) out.push({ text: text.slice(at) })
  return out
}
