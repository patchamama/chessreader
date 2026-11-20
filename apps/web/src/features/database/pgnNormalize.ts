import { Chess } from 'chess.js'

/** The languages of the piece letters; 'auto' picks the one that makes the most moves legal. */
export type PgnLanguage = 'en' | 'es' | 'de'
export type PgnLanguageChoice = PgnLanguage | 'auto'
export const PGN_LANGUAGES: PgnLanguage[] = ['en', 'es', 'de']

type Piece = 'K' | 'Q' | 'R' | 'B' | 'N'
/** Letter of each piece by language: English KQRBN, Spanish RDTAC, German KDTLS. */
export const PIECE_LETTERS: Record<PgnLanguage, Record<Piece, string>> = {
  en: { K: 'K', Q: 'Q', R: 'R', B: 'B', N: 'N' },
  es: { K: 'R', Q: 'D', R: 'T', B: 'A', N: 'C' },
  de: { K: 'K', Q: 'D', R: 'T', B: 'L', N: 'S' },
}
const REVERSE = Object.fromEntries(
  PGN_LANGUAGES.map((l) => [l, Object.fromEntries(Object.entries(PIECE_LETTERS[l]).map(([p, c]) => [c, p]))]),
) as Record<PgnLanguage, Record<string, Piece>>

const FIGURINES: Record<string, Piece | ''> = { '♔': 'K', '♚': 'K', '♕': 'Q', '♛': 'Q', '♖': 'R', '♜': 'R', '♗': 'B', '♝': 'B', '♘': 'N', '♞': 'N', '♙': '', '♟': '' }
const FIGURINE_RE = /[♔-♟]/g
const SUFFIX_RE = /(?:[+#!?‼⁉⁈]|e\.p\.)*$/
const RESULT_RE = /^(?:1-0|0-1|1\/2-1\/2|½-½|\*)$/
/** Everything a move may contain; any other character is reported. */
const UNKNOWN_RE = /[^a-h0-9KQRBNDTLSCAPOx=+#!?:.\-‼⁉⁈♔-♟]/gi

export interface NormalizedMove { san: string; /** "1. e4" / "1... e5". */ label: string; fen: string }
export interface Unrecognised { token: string; ply: number; label: string; /** The characters that no language knows (empty when the move is only illegal). */ chars: string[] }
export interface NormalizedPgn {
  /** The PGN with move numbers and letter case fixed, in the language it was written. */
  text: string
  language: PgnLanguage
  moves: NormalizedMove[]
  unrecognised: Unrecognised[]
}

interface Parsed { san: string; render: string }

/** An English SAN written with the piece letters of a language. */
function toLang(san: string, lang: PgnLanguage): string {
  const piece = /^[KQRBN]/.test(san) ? PIECE_LETTERS[lang][san[0] as Piece] + san.slice(1) : san
  return piece.replace(/=([QRBN])/, (_, p: Piece) => `=${PIECE_LETTERS[lang][p]}`)
}

/** Tries the readings of one token, in a language, on the position; plays the first legal one. */
function playToken(chess: Chess, raw: string, lang: PgnLanguage): Parsed | null {
  const letters = PIECE_LETTERS[lang]
  const t = raw.replace(FIGURINE_RE, (f) => (FIGURINES[f] ? letters[FIGURINES[f] as Piece] : '')).replace(/:/g, 'x')
  const suffix = SUFFIX_RE.exec(t)?.[0] ?? ''
  const core = t.slice(0, t.length - suffix.length)
  const tail = suffix.replace(/e\.p\./, '')
  const attempt = (san: string, render: string): Parsed | null => {
    try {
      const m = chess.move(san, { strict: false })
      return { san: m.san, render: render + tail }
    } catch {
      return null
    }
  }
  if (/^[Oo0](?:-[Oo0]){1,2}$/.test(core)) return attempt(core.length > 3 ? 'O-O-O' : 'O-O', core.length > 3 ? 'O-O-O' : 'O-O')
  // Long algebraic: Nb1-c3, e2-e4, e7xd8=Q.
  const long = /^[A-Za-z]?([a-h][1-8])[-x]([a-h][1-8])=?([A-Za-z])?$/i.exec(core)
  if (long) {
    const promo = long[3] ? REVERSE[lang][long[3].toUpperCase()] : undefined
    const found = chess.moves({ verbose: true }).find((m) => m.from === long[1].toLowerCase() && m.to === long[2].toLowerCase() && (!m.promotion || m.promotion.toUpperCase() === (promo ?? 'Q')))
    if (found) {
      const m = chess.move(found.san)
      return { san: m.san, render: toLang(m.san.replace(/[+#]$/, ''), lang) + tail }
    }
  }
  const pawn = (s: string) => {
    const lower = s.toLowerCase()
    if (!/^[a-h]/.test(lower)) return null
    const promo = /^(.*[a-h][18])=?([a-z])$/.exec(lower)
    if (!promo) return attempt(lower, lower)
    const piece = REVERSE[lang][promo[2].toUpperCase()]
    return piece ? attempt(`${promo[1]}=${piece}`, `${promo[1]}=${promo[2].toUpperCase()}`) : null
  }
  const piece = () => {
    const first = core[0]?.toUpperCase()
    if (first === 'P' && core.length > 1) return pawn(core.slice(1))
    const eng = first ? REVERSE[lang][first] : undefined
    if (!eng) return null
    const rest = core.slice(1).toLowerCase()
    return attempt(eng + rest, first + rest)
  }
  const order = /^[a-h]/.test(core[0] ?? '') ? [() => pawn(core), piece] : [piece, () => pawn(core)]
  for (const c of order) {
    const r = c()
    if (r) return r
  }
  return null
}

const label = (chess: Chess, token: string) => `${chess.moveNumber()}${chess.turn() === 'w' ? '. ' : '... '}${token}`

interface Prepared { headers: string[]; fen: string | undefined; tokens: string[]; result: string }

function prepare(raw: string): Prepared {
  const headers: string[] = []
  let body = raw.replace(/^\s*\[[^\]\n]*\]\s*$/gm, (h) => { headers.push(h.trim()); return '' })
  const fen = headers.map((h) => /^\[FEN\s+"([^"]+)"\]$/i.exec(h)?.[1]).find(Boolean)
  body = body.replace(/\{[^}]*\}/g, ' ').replace(/;[^\n]*/g, ' ').replace(/\$\d+/g, ' ').replace(/…/g, '...')
  for (let prev = ''; prev !== body;) { prev = body; body = body.replace(/\([^()]*\)/g, ' ') }
  let result = ''
  const tokens: string[] = []
  for (const piece of body.split(/\s+/).filter(Boolean)) {
    if (RESULT_RE.test(piece)) { result = piece; continue }
    const t = piece.replace(/^\d+\.+/, '').replace(/^\.+/, '')
    if (!t || /^\d+$/.test(t)) continue
    tokens.push(t)
  }
  return { headers, fen, tokens, result }
}

interface Run { language: PgnLanguage; moves: NormalizedMove[]; rendered: string[]; failed: { token: string; index: number; ply: number; label: string } | null; startNumber: number; startWhite: boolean }

function run(p: Prepared, language: PgnLanguage): Run {
  let chess: Chess
  try { chess = new Chess(p.fen) } catch { chess = new Chess() }
  const startNumber = chess.moveNumber()
  const startWhite = chess.turn() === 'w'
  const moves: NormalizedMove[] = []
  const rendered: string[] = []
  let failed: Run['failed'] = null
  for (let i = 0; i < p.tokens.length; i++) {
    const where = label(chess, p.tokens[i])
    const placed = label(chess, '')
    const r = playToken(chess, p.tokens[i], language)
    if (!r) { failed = { token: p.tokens[i], index: i, ply: moves.length + 1, label: where }; break }
    moves.push({ san: r.san, label: placed + r.san, fen: chess.fen() })
    rendered.push(r.render)
  }
  return { language, moves, rendered, failed, startNumber, startWhite }
}

/** The PGN movetext with a number before each white move (and before a black move that starts a line). */
function buildText(p: Prepared, r: Run): string {
  const out: string[] = []
  let number = r.startNumber
  let white = r.startWhite
  const push = (tok: string, first: boolean) => {
    if (white) out.push(`${number}.`)
    else if (first) out.push(`${number}...`)
    out.push(tok)
    if (!white) number++
    white = !white
  }
  r.rendered.forEach((tok, i) => push(tok, i === 0))
  if (r.failed) {
    push(r.failed.token, r.rendered.length === 0)
    out.push(...p.tokens.slice(r.failed.index + 1))
  }
  if (p.result) out.push(p.result)
  return [...p.headers, ...(p.headers.length ? [''] : []), out.join(' ')].join('\n')
}

/**
 * A tolerant PGN reader (S7, S8): fixes the move numbers ("1 e4 e5 2 Cf3" →
 * "1. e4 e5 2. Cf3") and the letter case ("NC6" → "Nc6"), reads figurines,
 * castling written with letters or zeros, captures, promotions and the check or
 * mark symbols, in English, Spanish and German (auto: the language with the
 * most legal moves). The first move that cannot be read is reported.
 */
export function normalizePgn(raw: string, options: { language?: PgnLanguageChoice } = {}): NormalizedPgn {
  const p = prepare(raw)
  const choice = options.language ?? 'auto'
  const runs = (choice === 'auto' ? PGN_LANGUAGES : [choice]).map((l) => run(p, l))
  const best = runs.reduce((a, b) => (b.moves.length > a.moves.length ? b : a))
  const unrecognised: Unrecognised[] = best.failed
    ? [{ token: best.failed.token, ply: best.failed.ply, label: best.failed.label, chars: [...new Set(best.failed.token.match(UNKNOWN_RE) ?? [])] }]
    : []
  return { text: buildText(p, best), language: best.language, moves: best.moves, unrecognised }
}

/** Played moves as PGN: "1. e4 e5 2. Nc3", or "1... e5 2. Nf3" when Black moves first (S18). */
export function numberMoves(startFen: string, sans: string[]): string {
  let chess: Chess
  try { chess = new Chess(startFen) } catch { return sans.join(' ') }
  const out: string[] = []
  sans.forEach((san, i) => {
    const white = chess.turn() === 'w'
    if (white) out.push(`${chess.moveNumber()}.`)
    else if (i === 0) out.push(`${chess.moveNumber()}...`)
    out.push(san)
    try { chess.move(san) } catch { /* keep the text as given */ }
  })
  return out.join(' ')
}
