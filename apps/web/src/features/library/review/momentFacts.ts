import { Chess } from 'chess.js'
import type { PlyInput, Score } from '@chess-ebook/chess-shared'

/**
 * The facts a language model needs to comment a key moment of a game (S5):
 * material of each side after every ply, what the game actually did next,
 * and the detected pattern (sacrifice, hanging blunder, winning capture
 * sequence, mating attack). Pure: the engine's data comes in the plies.
 */

export type PieceLetter = 'p' | 'n' | 'b' | 'r' | 'q'
type Color = 'white' | 'black'

const VALUES: Record<string, number> = { p: 1, n: 3, b: 3, r: 5, q: 9 }
const NAMES: Record<PieceLetter, string> = { p: 'pawn', n: 'knight', b: 'bishop', r: 'rook', q: 'queen' }

/** Evaluation (centipawns) from which a position is a mate, for comparisons. */
const MATE_CP = 10000
/** Material points a move must lose, net after the reply, to be a sacrifice or a loss. */
const MIN_MATERIAL = 2
/** The longest group of plies read together as one exchange sequence. */
const MAX_GROUP = 12
/** A quiet move that loses at least this much evaluation, with few moves to choose from, is a possible zugzwang. */
const ZUGZWANG_DROP_CP = 150
const ZUGZWANG_MAX_MOVES = 6
/** A sacrifice is paid back when the evaluation is no worse than this below the one before it. */
const EQUAL_TOLERANCE_CP = 30
/** An evaluation that improves by this much for the mover is worth a sacrifice. */
export const SACRIFICE_GAIN_CP = 60
/** A material loss with an evaluation drop of this much is a blunder. */
const BLUNDER_DROP_CP = 100

export interface Material { white: number; black: number }

/** What a ply did to the material on the board. */
export interface PlyMaterial {
  /** 1-based ply of the game. */
  ply: number
  color: Color
  san: string
  /** The piece the mover took, if any. */
  captured?: PieceLetter
  /** The piece a pawn became, if any. */
  promotion?: PieceLetter
  before: Material
  after: Material
  /** White minus Black after the ply. */
  balance: number
  /** Change of the mover's lead caused by this ply alone. */
  moverGain: number
}

const strip = (san: string) => san.replace(/[+#!?]+$/g, '')
const sign = (color: Color) => (color === 'white' ? 1 : -1)

/** Material of each side in a position, kings aside: P1 N3 B3 R5 Q9. */
export function materialOf(fen: string): Material {
  const out: Material = { white: 0, black: 0 }
  for (const row of new Chess(fen).board()) {
    for (const sq of row) if (sq && sq.type !== 'k') out[sq.color === 'w' ? 'white' : 'black'] += VALUES[sq.type]
  }
  return out
}

/** The material of every ply of a game. */
export function materialByPly(plies: PlyInput[]): PlyMaterial[] {
  return plies.map((p, i) => {
    const before = materialOf(p.fenBefore)
    const after = materialOf(p.fenAfter)
    let captured: PieceLetter | undefined
    let promotion: PieceLetter | undefined
    try {
      const move = new Chess(p.fenBefore).move(strip(p.san))
      captured = move.captured as PieceLetter | undefined
      promotion = move.promotion as PieceLetter | undefined
    } catch { /* the facts still hold: the material comes from the positions */ }
    const s = sign(p.color)
    return {
      ply: i + 1, color: p.color, san: p.san, captured, promotion, before, after,
      balance: after.white - after.black,
      moverGain: s * ((after.white - after.black) - (before.white - before.black)),
    }
  })
}

/** An evaluation for the side that moved: centipawns, with a mate as ±10000. */
export function moverCp(score: Score, color: Color): number {
  const s = sign(color)
  if (score.mate !== undefined) return score.mate === 0 ? 0 : s * Math.sign(score.mate) * MATE_CP
  return s * (score.cp ?? 0)
}

/** "+1.8", "−0.4", "mate in 3", "being mated in 2": a score as the mover sees it. */
export function moverScoreText(score: Score, color: Color): string {
  const s = sign(color)
  if (score.mate !== undefined) {
    const n = s * score.mate
    return n > 0 ? `mate in ${n}` : n < 0 ? `being mated in ${-n}` : 'equal'
  }
  const pawns = (s * (score.cp ?? 0)) / 100
  const text = Math.abs(pawns).toFixed(1)
  return pawns >= 0 ? `+${text}` : `−${text}`
}

/**
 * How little choice a move had. `only-move`: the only legal move; `check`: the answer to a check
 * (the king must be saved, so the replies are few); `zugzwang`: a quiet move in a position with few
 * moves that gives up a lot of evaluation (every move worsens the position: possible zugzwang).
 */
export type ForcedKind = 'only-move' | 'check' | 'zugzwang'

export interface PlayedStep {
  /** "12.Bxe6", "12...Qh4+". */
  label: string
  color: Color
  captured?: PieceLetter
  promotion?: PieceLetter
  /** Material lead of the side that played the key move, after this ply. */
  lead: number
  /** The move gives check. */
  check?: boolean
  forced?: ForcedKind
}

/** Which kind of material is given: the queen, the exchange (a rook for a minor piece), a rook, a minor piece or a pawn. */
export type ExchangeKind = 'queen' | 'exchange' | 'rook' | 'minor' | 'pawn'

/** The exchange sequence the key move opens: from it until the captures and checks stop. */
export interface ExchangeGroup {
  /** Plies of the group, the key move included. */
  plies: number
  materialStart: Material
  materialEnd: Material
  /** Material lead of the side of the key move at the start (before the key move) and at the end. */
  leadStart: number
  leadEnd: number
  evalStartText: string
  evalEndText: string
}

export type EndKind = 'mate' | 'promotion' | 'material-won' | 'material-lost' | 'capture-sequence' | 'quiet'

export interface Ending {
  kind: EndKind
  /** The side that mates or promotes. */
  by?: Color
  /** Points won or lost (for the side of the key move), or captures made. */
  amount?: number
}

export type MomentPattern =
  | {
      kind: 'sacrifice'
      /** Points given for good at the end of the group, or at the worst moment when they came back. */
      amount: number
      gave: PieceLetter[]
      took: PieceLetter[]
      buys: 'mate' | 'material' | 'attack' | 'positional'
      /** The evaluation (for the mover) before the key move and at the end of the group. */
      evalBefore: string
      evalAfter: string
      exchange?: ExchangeKind
      /** The key move put a piece where it is taken at once ("to the slaughter"). */
      offered?: { piece: PieceLetter; square: string }
      /** The material came back before the group ended. */
      recovered?: boolean
      plies: number
      /** The forced replies of the group. */
      forced: { label: string; kind: ForcedKind }[]
    }
  | { kind: 'blunder-hanging'; amount: number; gave: PieceLetter[]; evalBefore: string; evalAfter: string }
  | { kind: 'winning-capture-sequence'; amount: number; captures: number }
  | { kind: 'mating-attack'; mateIn?: number }

export interface MomentFacts {
  /** 1-based ply of the key move. */
  ply: number
  moveNumber: number
  color: Color
  san: string
  /** The position before the move. */
  fen: string
  fenAfter: string
  evalBefore: Score
  evalAfter: Score
  /** The same, as the mover sees them. */
  evalBeforeText: string
  evalAfterText: string
  best?: { san: string; line: string[] }
  second?: { san: string; line: string[]; score: Score }
  materialBefore: Material
  materialAfter: Material
  /** The mover's material lead before the move. */
  leadBefore: number
  /** The key move and the plies played after it, with the lead along the way. */
  played: PlayedStep[]
  group: ExchangeGroup
  ending: Ending
  patterns: MomentPattern[]
}

const label = (p: PlyInput) => `${p.moveNumber}${p.color === 'white' ? '.' : '...'}${p.san}`

/** The kind of material given: the queen, the exchange (a rook for a minor piece), a rook, a minor piece, a pawn. */
function exchangeKind(gave: PieceLetter[], took: PieceLetter[]): ExchangeKind | undefined {
  const top = (list: PieceLetter[]) => list.reduce<PieceLetter | undefined>((m, p) => (!m || VALUES[p] > VALUES[m] ? p : m), undefined)
  const g = top(gave)
  const t = top(took)
  if (!g) return undefined
  if (g === 'q') return t === 'q' ? undefined : 'queen'
  if (g === 'r') return t === 'b' || t === 'n' ? 'exchange' : t === 'r' || t === 'q' ? undefined : 'rook'
  if (g === 'b' || g === 'n') return t === 'p' || !t ? 'minor' : undefined
  return 'pawn'
}

/**
 * The key move puts a piece (a knight or more) where the opponent takes it at once: a piece given
 * away ("to the slaughter"), whether or not the key move itself took something. Not a trade: what the
 * move took is worth less than the piece.
 */
function offeredPiece(plies: PlyInput[], materials: PlyMaterial[], index: number): { piece: PieceLetter; square: string } | undefined {
  const ply = plies[index]
  const reply = plies[index + 1]
  if (!reply || !materials[index + 1]?.captured || reply.to !== ply.to) return undefined
  try {
    const piece = new Chess(ply.fenBefore).move(strip(ply.san)).piece as PieceLetter
    const took = materials[index].captured
    if (VALUES[piece] < 3 || (took && VALUES[took] >= VALUES[piece])) return undefined
    return { piece, square: ply.to }
  } catch {
    return undefined
  }
}

/**
 * The facts of the moment at `index` (0-based ply of `plies`): the position,
 * the move, the evaluations, the engine's lines, what the game did over the
 * next `horizon` plies and the patterns detected in it.
 */
export function momentFacts(
  plies: PlyInput[],
  index: number,
  options: { horizon?: number; materials?: PlyMaterial[] } = {},
): MomentFacts {
  const cap = Math.max(1, options.horizon ?? MAX_GROUP)
  const materials = options.materials ?? materialByPly(plies)
  const ply = plies[index]
  const mat = materials[index]
  const color = ply.color
  const s = sign(color)
  const leadBefore = s * (mat.before.white - mat.before.black) || 0

  const forcedOf = (k: number): ForcedKind | undefined => {
    try {
      const chess = new Chess(plies[k].fenBefore)
      const n = chess.moves().length
      if (n === 1) return 'only-move'
      if (chess.inCheck()) return 'check'
      const drop = moverCp(plies[k].before, plies[k].color) - moverCp(plies[k].after, plies[k].color)
      if (n <= ZUGZWANG_MAX_MOVES && !materials[k].captured && !plies[k].san.includes('#') && drop >= ZUGZWANG_DROP_CP) return 'zugzwang'
    } catch { /* an unreadable position: no claim */ }
    return undefined
  }
  const forced = new Map<number, ForcedKind | undefined>()
  const forcedAt = (k: number) => { if (!forced.has(k)) forced.set(k, forcedOf(k)); return forced.get(k) }

  // The group: the key move and the plies that follow while they are captures, checks, promotions or
  // forced replies; it ends after two quiet plies in a row (or at a mate, or at the cap).
  let last = index
  let quiet = 0
  for (let k = index + 1; k < plies.length && k < index + cap; k++) {
    if (plies[k - 1].san.includes('#')) break
    const f = forcedAt(k)
    const active = !!materials[k].captured || !!materials[k].promotion || /[+#]/.test(plies[k].san) || f === 'only-move' || f === 'check'
    if (active) { quiet = 0; last = k } else if (++quiet >= 2) break
  }
  const group = plies.slice(index, last + 1)
  const played: PlayedStep[] = group.map((p, k) => ({
    label: label(p), color: p.color, captured: materials[index + k].captured, promotion: materials[index + k].promotion,
    lead: s * materials[index + k].balance || 0,
    ...(/[+#]/.test(p.san) ? { check: true } : {}),
    ...(forcedAt(index + k) ? { forced: forcedAt(index + k) } : {}),
  }))
  const leadEnd = played[played.length - 1].lead
  const net = leadEnd - leadBefore

  // Material given and taken over the whole group, by the side of the key move.
  const gaveAll: PieceLetter[] = []
  const tookAll: PieceLetter[] = []
  group.forEach((p, k) => {
    const c = materials[index + k].captured
    if (c) (p.color === color ? tookAll : gaveAll).push(c)
  })
  // The worst moment of the group: behind after the opponent's capture and not taking it back at once
  // (a trade is behind for a ply too, and is not a sacrifice).
  let deficit = 0
  group.forEach((p, k) => {
    if (p.color === color) return
    const next = materials[index + k + 1]
    if (next && k + 1 < group.length && next.captured) return
    deficit = Math.max(deficit, leadBefore - played[k].lead)
  })

  // What the continuation ends in is read over the whole window, a mate or a promotion may come later.
  const window = plies.slice(index, index + cap)
  const mateStep = window.findIndex((p) => p.san.includes('#'))
  const promoStep = window.findIndex((_, k) => materials[index + k].promotion)
  const captures = played.filter((st) => st.captured).length
  const mateBy: Color | undefined = mateStep >= 0 ? window[mateStep].color : undefined
  const ending: Ending =
    mateBy ? { kind: 'mate', by: mateBy }
    : promoStep >= 0 ? { kind: 'promotion', by: materials[index + promoStep].color }
    : net >= MIN_MATERIAL ? { kind: 'material-won', amount: net }
    : net <= -MIN_MATERIAL ? { kind: 'material-lost', amount: -net }
    : captures >= 2 ? { kind: 'capture-sequence', amount: captures }
    : { kind: 'quiet' }

  const lastPly = plies[last]
  const before = moverCp(ply.before, color)
  const after = moverCp(lastPly.after, color)
  const evalBeforeText = moverScoreText(ply.before, color)
  const evalAfterText = moverScoreText(lastPly.after, color)
  const mateForMover = (lastPly.after.mate !== undefined && s * lastPly.after.mate > 0) || mateBy === color
  const paid = mateForMover || after >= before - EQUAL_TOLERANCE_CP

  const patterns: MomentPattern[] = []
  const offered = offeredPiece(plies, materials, index)
  const forcedMoves = played.flatMap((st) => (st.forced ? [{ label: st.label, kind: st.forced }] : []))
  const checks = group.slice(1).some((p) => p.color === color && /[+#]/.test(p.san))
  const sacrifice = (amount: number, recovered: boolean): MomentPattern => ({
    kind: 'sacrifice', amount, gave: gaveAll, took: tookAll,
    buys: mateForMover ? 'mate' : recovered ? 'material' : after - before >= SACRIFICE_GAIN_CP || checks ? 'attack' : 'positional',
    evalBefore: evalBeforeText, evalAfter: evalAfterText,
    exchange: exchangeKind(gaveAll, tookAll), ...(offered ? { offered } : {}), ...(recovered ? { recovered } : {}),
    plies: group.length, forced: forcedMoves,
  })

  if (-net >= MIN_MATERIAL) {
    if (paid) patterns.push(sacrifice(-net, false))
    else if (before - after >= BLUNDER_DROP_CP && !mateForMover) {
      patterns.push({ kind: 'blunder-hanging', amount: -net, gave: gaveAll, evalBefore: evalBeforeText, evalAfter: evalAfterText })
    }
  } else if (deficit >= MIN_MATERIAL && paid) {
    patterns.push(sacrifice(deficit, true))
  }
  if (mateForMover) {
    // The mate as it stood right after the key move (the end of the group may be nearer).
    const first = ply.after.mate !== undefined && s * ply.after.mate > 0 ? ply.after.mate : lastPly.after.mate
    patterns.push({ kind: 'mating-attack', mateIn: first !== undefined ? s * first : undefined })
  }
  if (net >= MIN_MATERIAL && captures >= 2 && after >= before - BLUNDER_DROP_CP && !patterns.some((p) => p.kind === 'sacrifice')) {
    patterns.push({ kind: 'winning-capture-sequence', amount: net, captures })
  }

  const exchangeGroup: ExchangeGroup = {
    plies: group.length, materialStart: mat.before, materialEnd: materials[last].after, leadStart: leadBefore, leadEnd,
    evalStartText: evalBeforeText, evalEndText: evalAfterText,
  }
  return {
    ply: index + 1, moveNumber: ply.moveNumber, color, san: ply.san, fen: ply.fenBefore, fenAfter: ply.fenAfter,
    evalBefore: ply.before, evalAfter: ply.after, evalBeforeText, evalAfterText,
    best: ply.best, second: ply.second,
    materialBefore: mat.before, materialAfter: mat.after, leadBefore, played, group: exchangeGroup, ending, patterns,
  }
}

const pieces = (list: PieceLetter[]) => (list.length ? list.map((p) => `a ${NAMES[p]}`).join(' and ') : 'nothing')
const PIECE_A = { p: 'a pawn', n: 'a knight', b: 'a bishop', r: 'a rook', q: 'a queen' } as const
const FORCED_TEXT: Record<ForcedKind, string> = {
  'only-move': 'the only legal move',
  check: 'the answer to a check',
  zugzwang: 'possible zugzwang: a quiet move that gives up a lot with few moves to choose from',
}

/** A pattern as one plain English sentence for the model. */
export function describePattern(p: MomentPattern): string {
  switch (p.kind) {
    case 'sacrifice': {
      const buys = {
        mate: 'the plan is a mating attack',
        material: 'the material comes back before the exchanges end',
        attack: 'the plan is the attack',
        positional: 'the compensation is positional (no material comes back)',
      }[p.buys]
      const kind = p.exchange
        ? {
            queen: ' of the queen',
            exchange: ' of the exchange',
            rook: ' of a rook',
            minor: ' of a minor piece',
            pawn: ' of a pawn',
          }[p.exchange]
        : ''
      const offered = p.offered ? `${PIECE_A[p.offered.piece]} is offered on ${p.offered.square} and taken at once; ` : ''
      const net = p.recovered ? `behind by up to ${p.amount} points before the material comes back` : `net −${p.amount}`
      const forced = p.forced.length ? ` Forced replies: ${p.forced.map((f) => `${f.label} (${FORCED_TEXT[f.kind]})`).join(', ')}.` : ''
      return `sacrifice${kind} (${pieces(p.gave)} for ${pieces(p.took)}): ${offered}${net} over ${p.plies} plies, and the evaluation goes from ${p.evalBefore} to ${p.evalAfter}: ${buys}.${forced}`
    }
    case 'blunder-hanging':
      return `blunder: loses material (net −${p.amount}, giving ${pieces(p.gave)}) and the evaluation drops from ${p.evalBefore} to ${p.evalAfter}.`
    case 'winning-capture-sequence':
      return `winning capture sequence: ${p.captures} captures in a row leave the mover ${p.amount} points of material up.`
    case 'mating-attack':
      return p.mateIn ? `mating attack: the mover has a forced mate in ${p.mateIn}.` : 'mating attack: the continuation ends in checkmate by the mover.'
  }
}

/** What the played continuation ends in, as one sentence. */
export function describeEnding(e: Ending): string {
  switch (e.kind) {
    case 'mate': return `the continuation ends in checkmate by ${e.by}`
    case 'promotion': return `the continuation ends in a promotion by ${e.by}`
    case 'material-won': return `the continuation wins ${e.amount} points of material for the mover`
    case 'material-lost': return `the continuation loses ${e.amount} points of material for the mover`
    case 'capture-sequence': return `the continuation is a sequence of ${e.amount} captures with material level`
    case 'quiet': return 'the continuation is quiet (no change of material)'
  }
}
