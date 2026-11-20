import { Chess } from 'chess.js'

/**
 * References to squares, plans and files written in the prose of a comment:
 * idea moves ("con idea de Df6"), plan lists in parentheses ("(a6-a5, Tb8)"),
 * pawn advances ("avance h2-h4-h5"), whole files/ranks ("columnas b y c") and
 * pawn groups ("peones desde la columna a hasta d").
 *
 * Two phases: `findProseReferences` reads only the text (positions + the side
 * that is talking, from the move number written before); `resolveProseReference`
 * reads the board (which piece goes where) at the point of the text.
 */

export type ProseLang = 'es' | 'en' | 'de' | 'auto'
type PieceType = 'k' | 'q' | 'r' | 'b' | 'n'
type Side = 'w' | 'b'

export interface ProseMarks {
  squares: string[]
  arrows: { from: string; to: string }[]
  /** File letters ("b") to light entirely. */
  files: string[]
  /** Rank digits ("7") to light entirely. */
  ranks: string[]
  /** Squares to light one after another (a flank's pawns), in order; also in `squares`. */
  sequence?: string[]
}

/** Time between two squares of a progressive illumination (between 0.5 and 1 s). */
export const PROSE_REVEAL_STEP_MS = 800

type Spec =
  | { kind: 'pair'; from: string; to: string }
  | { kind: 'advance'; path: string[] }
  | { kind: 'idea'; piece: PieceType; hint: string; to: string }
  | { kind: 'files'; files: string[] }
  | { kind: 'ranks'; ranks: string[] }
  | { kind: 'pawns'; fromFile: string; toFile: string; opponent: boolean }
  | { kind: 'flank'; flank: 'king' | 'queen'; opponent: boolean }

export type ProseReference = { start: number; end: number; side: Side | null } & Spec

const PIECE_LETTERS: Record<Exclude<ProseLang, 'auto'>, Record<string, PieceType>> = {
  en: { K: 'k', Q: 'q', R: 'r', B: 'b', N: 'n' },
  es: { R: 'k', D: 'q', T: 'r', A: 'b', C: 'n' },
  de: { K: 'k', D: 'q', T: 'r', L: 'b', S: 'n' },
}
// Auto: the letters that only one language uses, English for the shared ones (R = rook).
const AUTO_LETTERS: Record<string, PieceType> = { ...PIECE_LETTERS.de, ...PIECE_LETTERS.es, ...PIECE_LETTERS.en }

/** The language of a prose (Spanish, English or German) from its most common function words; null when unclear. */
export function detectProseLang(text: string): Exclude<ProseLang, 'auto'> | null {
  const words = text.toLowerCase().match(/[a-zà-ÿß]+/g) ?? []
  const score = { es: 0, en: 0, de: 0 }
  const lists: Record<keyof typeof score, Set<string>> = {
    es: new Set(['de', 'la', 'el', 'los', 'las', 'con', 'que', 'del', 'por', 'una', 'para', 'las', 'como', 'más', 'su', 'se', 'en', 'y']),
    en: new Set(['the', 'and', 'of', 'with', 'to', 'is', 'that', 'in', 'for', 'on', 'this', 'by', 'it', 'as', 'be', 'are']),
    de: new Set(['der', 'die', 'und', 'mit', 'das', 'den', 'ist', 'nicht', 'von', 'zu', 'ein', 'eine', 'auf', 'dem', 'im', 'sich']),
  }
  for (const w of words) for (const k of ['es', 'en', 'de'] as const) if (lists[k].has(w)) score[k]++
  const ranked = (Object.entries(score) as ['es' | 'en' | 'de', number][]).sort((a, b) => b[1] - a[1])
  return ranked[0][1] >= 3 && ranked[0][1] > ranked[1][1] ? ranked[0][0] : null
}

function letters(lang: ProseLang): Record<string, PieceType> {
  return lang === 'auto' ? AUTO_LETTERS : PIECE_LETTERS[lang]
}

const SQ = '[a-h][1-8]'
const DASH = '\\s*[-–]\\s*'

/** The side that talks at `offset`: from the nearest move number written before ("21…" black, "21." white). */
export function sideAt(text: string, offset: number): Side | null {
  const before = text.slice(Math.max(0, offset - 240), offset)
  let best: { at: number; side: Side } | null = null
  for (const m of before.matchAll(/\d+\s*(?:\.\s*\.\s*\.|…|\.{2,})/g)) best = { at: m.index!, side: 'b' }
  for (const m of before.matchAll(/\d+\s*\.(?!\s*\.)(?=\s*[A-Za-z♔♕♖♗♘♙])/g)) {
    if (!best || m.index! > best.at) best = { at: m.index!, side: 'w' }
  }
  return best ? best.side : null
}

function parseItem(raw: string, lang: ProseLang): Spec | null {
  const s = raw.trim()
  let m = new RegExp(`^(${SQ})${DASH}(${SQ})$`).exec(s)
  if (m) return { kind: 'pair', from: m[1], to: m[2] }
  const pieceRe = new RegExp(`^([A-Z])([a-h1-8])?x?(${SQ})[+#!?]*$`)
  m = pieceRe.exec(s)
  if (m) {
    const piece = letters(lang)[m[1]]
    if (piece) return { kind: 'idea', piece, hint: m[2] ?? '', to: m[3] }
  }
  return null
}

/** Find every prose reference in `text`, in text order, none overlapping. */
export function findProseReferences(text: string, opts: { lang?: ProseLang; fen?: string | null } = {}): ProseReference[] {
  // Auto: the language of the text itself ('R' is the king in Spanish, a rook in English).
  const lang: ProseLang = opts.lang && opts.lang !== 'auto' ? opts.lang : detectProseLang(text) ?? 'auto'
  const found: ProseReference[] = []
  const add = (start: number, end: number, spec: Spec) => found.push({ start, end, side: sideAt(text, start), ...spec })

  // Plan lists in parentheses: every item must be a square pair or a piece move.
  for (const g of text.matchAll(/\(([^()\n]{1,160})\)/g)) {
    const inner = g[1]
    if (/\d+\s*(?:\.|…)/.test(inner)) continue // a variation, not a plan
    const base = g.index! + 1
    const items: { s: number; e: number; spec: Spec }[] = []
    let ok = true
    for (const part of inner.matchAll(/[^,;]+/g)) {
      const lead = part[0].length - part[0].trimStart().length
      const spec = parseItem(part[0], lang)
      if (!spec) { ok = false; break }
      const s = base + part.index! + lead
      items.push({ s, e: s + part[0].trim().length, spec })
    }
    if (ok) for (const it of items) add(it.s, it.e, it.spec)
  }

  // Idea move outside parentheses: "con idea de Df6".
  for (const m of text.matchAll(new RegExp(`(?:idea\\s+de|idea\\s+of|idea:|Idee)\\s+([A-Z][a-h1-8]?x?${SQ})`, 'g'))) {
    const spec = parseItem(m[1], lang)
    if (spec) { const s = m.index! + m[0].length - m[1].length; add(s, s + m[1].length, spec) }
  }

  // Pawn advance: "avance g2-g4", "avance h2-h4-h5".
  for (const m of text.matchAll(new RegExp(`(?:avances?|advance|push|Vorsto(?:ß|ss))\\s+(?:(?:del|de|of|the)\\s+)?(?:(?:pe[óo]n|pawn|Bauern?)\\s+)?(${SQ}(?:${DASH}${SQ})+)`, 'gi'))) {
    const s = m.index! + m[0].length - m[1].length
    add(s, s + m[1].length, { kind: 'advance', path: m[1].match(new RegExp(SQ, 'g'))! })
  }

  // Whole files: "columnas b y c", "columna b", "columnas b-c", "Linien b und c".
  const word = '(?:columnas?|columns?|files?|Linien?)'
  for (const m of text.matchAll(new RegExp(`${word}\\s+([a-h])(?:\\s*(?:,|y|and|und|-|–)\\s*([a-h]))?(?![A-Za-zÀ-ÿ0-9])`, 'g'))) {
    const next = text.slice(m.index! + m[0].length).match(/^\s+([a-zà-ÿ]+)/)
    if (next && !/^(?:de|del|of|der|des|en|in|el|la|the|y|and|und)$/.test(next[1])) continue
    const fs = [m[1], m[2]].filter(Boolean) as string[]
    const range = fs.length === 2 && /[-–]/.test(m[0]) ? span(fs[0], fs[1]) : fs
    add(m.index!, m.index! + m[0].length, { kind: 'files', files: range })
  }

  // Whole ranks: "fila 7", "7ª fila", "rank 7", "Reihe 7".
  for (const m of text.matchAll(/(?:filas?|rows?|ranks?|Reihen?)\s+([1-8])(?![0-9])|\b([1-8])\s*[ªº.]?\s*(?:fila|row|rank|Reihe)\b/gi)) {
    add(m.index!, m.index! + m[0].length, { kind: 'ranks', ranks: [m[1] ?? m[2]] })
  }

  // Pawn group: "peones … desde la columna a hasta d".
  for (const m of text.matchAll(/(?:peones|pawns|Bauern)[^.;()]{0,50}?(?:desde|from|von)\s+(?:la\s+)?(?:columna|fila|file|column|Linie)\s+([a-h])\s+(?:hasta|a|to|bis)\s+(?:la\s+)?(?:(?:columna|fila|file|column|Linie)\s+)?([a-h])(?![A-Za-zÀ-ÿ])/gi)) {
    const window = text.slice(Math.max(0, m.index! - 60), m.index!)
    const opponent = /presi[oó]n|ataque|atac|sobre|pressure|attack|against|Druck|Angriff|gegen/i.test(window + m[0])
    add(m.index!, m.index! + m[0].length, { kind: 'pawns', fromFile: m[1].toLowerCase(), toFile: m[2].toLowerCase(), opponent })
  }

  // A whole flank: "peones del flanco de rey", "king-side pawns", "Königsflügel".
  const cue = /presi[oó]n|ataque|atac|sobre|pressure|attack|against|Druck|Angriff|gegen/i
  const flankRe = /peones\s+(?:del?\s+)?(?:flanco|ala)\s+(?:del?\s+)?(rey|dama)|(?:flanco|ala)\s+(?:del?\s+)?(rey|dama)|(king|queen)[\s-]?side(?:\s+pawns)?|(?:Bauern\s+(?:am|auf\s+dem|im)\s+)?(K[öo]nigs|Damen)fl[üu]gel/gi
  for (const m of text.matchAll(flankRe)) {
    const which = (m[1] ?? m[2] ?? m[3] ?? m[4]).toLowerCase()
    const flank = /^(rey|king|k[öo]nigs)$/.test(which) ? 'king' : 'queen'
    const window = text.slice(Math.max(0, m.index! - 60), m.index!)
    add(m.index!, m.index! + m[0].length, { kind: 'flank', flank, opponent: cue.test(window) })
  }

  found.sort((a, b) => a.start - b.start || b.end - a.end)
  const out: ProseReference[] = []
  let last = -1
  for (const r of found) {
    if (r.start < last) continue
    out.push(r)
    last = r.end
  }
  return out
}

function span(a: string, b: string): string[] {
  const lo = Math.min(a.charCodeAt(0), b.charCodeAt(0)), hi = Math.max(a.charCodeAt(0), b.charCodeAt(0))
  return Array.from({ length: hi - lo + 1 }, (_, i) => String.fromCharCode(lo + i))
}

function withTurn(fen: string, side: Side): string {
  const f = fen.split(' ')
  return [f[0], side, f[2] ?? '-', '-', f[4] ?? '0', f[5] ?? '1'].join(' ')
}

/** Where the marks of one reference go on the board `fen` (the position the text talks about). */
export function resolveProseReference(ref: ProseReference, fen: string | null): ProseMarks {
  const marks: ProseMarks = { squares: [], arrows: [], files: [], ranks: [] }
  const turn: Side = (fen?.split(' ')[1] as Side | undefined) === 'b' ? 'b' : 'w'
  const side: Side = ref.side ?? turn
  switch (ref.kind) {
    case 'pair':
      marks.squares.push(ref.from, ref.to)
      marks.arrows.push({ from: ref.from, to: ref.to })
      break
    case 'advance':
      marks.squares.push(...ref.path)
      for (let i = 0; i + 1 < ref.path.length; i++) marks.arrows.push({ from: ref.path[i], to: ref.path[i + 1] })
      break
    case 'files':
      marks.files.push(...ref.files)
      break
    case 'ranks':
      marks.ranks.push(...ref.ranks)
      break
    case 'idea': {
      marks.squares.push(ref.to)
      if (!fen) break
      try {
        const chess = new Chess(withTurn(fen, side), { skipValidation: true })
        const from = chess
          .moves({ verbose: true })
          .filter((mv) => mv.piece === ref.piece && mv.to === ref.to && (!ref.hint || mv.from.includes(ref.hint)))
          .map((mv) => mv.from)
        const origins = [...new Set(from)]
        if (origins.length === 1) {
          marks.squares.unshift(origins[0])
          marks.arrows.push({ from: origins[0], to: ref.to })
        }
      } catch { /* an unreadable position: only the destination */ }
      break
    }
    case 'flank': {
      if (!fen) break
      const color: Side = ref.opponent ? (side === 'w' ? 'b' : 'w') : side
      const files = ref.flank === 'king' ? ['f', 'g', 'h'] : ['a', 'b', 'c']
      try {
        const chess = new Chess(fen, { skipValidation: true })
        const pawns: string[] = []
        for (const row of chess.board()) for (const cell of row) {
          if (cell && cell.type === 'p' && cell.color === color && files.includes(cell.square[0])) pawns.push(cell.square)
        }
        pawns.sort()
        marks.squares.push(...pawns)
        marks.sequence = pawns
      } catch { /* unreadable position */ }
      break
    }
    case 'pawns': {
      if (!fen) break
      const color: Side = ref.opponent ? (side === 'w' ? 'b' : 'w') : side
      try {
        const chess = new Chess(fen, { skipValidation: true })
        for (const row of chess.board()) {
          for (const cell of row) {
            if (cell && cell.type === 'p' && cell.color === color && span(ref.fromFile, ref.toFile).includes(cell.square[0])) {
              marks.squares.push(cell.square)
            }
          }
        }
      } catch { /* unreadable position */ }
      break
    }
  }
  return marks
}

/** Every square a set of marks lights (files and ranks expanded). */
export function marksToSquares(marks: ProseMarks): string[] {
  const out = new Set(marks.squares)
  for (const f of marks.files) for (let r = 1; r <= 8; r++) out.add(`${f}${r}`)
  for (const r of marks.ranks) for (const f of 'abcdefgh') out.add(`${f}${r}`)
  return [...out]
}
