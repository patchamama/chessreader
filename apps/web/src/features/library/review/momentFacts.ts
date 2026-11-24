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

export interface PlayedStep {
  /** "12.Bxe6", "12...Qh4+". */
  label: string
  color: Color
  captured?: PieceLetter
  promotion?: PieceLetter
  /** Material lead of the side that played the key move, after this ply. */
  lead: number
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
  | { kind: 'sacrifice'; amount: number; gave: PieceLetter[]; took: PieceLetter[]; buys: 'mate' | 'material' | 'attack' | 'positional'; evalBefore: string; evalAfter: string }
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
  ending: Ending
  patterns: MomentPattern[]
}

const label = (p: PlyInput) => `${p.moveNumber}${p.color === 'white' ? '.' : '...'}${p.san}`

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
  const horizon = options.horizon ?? 6
  const materials = options.materials ?? materialByPly(plies)
  const ply = plies[index]
  const mat = materials[index]
  const color = ply.color
  const s = sign(color)
  const leadBefore = s * (mat.before.white - mat.before.black) || 0

  const window = plies.slice(index, index + 1 + horizon)
  const played: PlayedStep[] = window.map((p, k) => ({
    label: label(p), color: p.color, captured: materials[index + k].captured, promotion: materials[index + k].promotion,
    lead: s * materials[index + k].balance || 0,
  }))
  const windowNet = played[played.length - 1].lead - leadBefore

  // The net result of the move and the reply (an exchange is not a sacrifice).
  const afterReply = materials[index + 1] ? s * materials[index + 1].balance : s * mat.balance
  const netAfterReply = afterReply - leadBefore
  const netAfterMove = s * mat.balance - leadBefore

  const mateStep = window.findIndex((p) => p.san.includes('#'))
  const promoStep = played.findIndex((st) => st.promotion)
  const captures = played.filter((st) => st.captured).length
  const mateBy: Color | undefined = mateStep >= 0 ? window[mateStep].color : undefined
  const ending: Ending =
    mateBy ? { kind: 'mate', by: mateBy }
    : promoStep >= 0 ? { kind: 'promotion', by: played[promoStep].color }
    : windowNet >= MIN_MATERIAL ? { kind: 'material-won', amount: windowNet }
    : windowNet <= -MIN_MATERIAL ? { kind: 'material-lost', amount: -windowNet }
    : captures >= 2 ? { kind: 'capture-sequence', amount: captures }
    : { kind: 'quiet' }

  const before = moverCp(ply.before, color)
  const after = moverCp(ply.after, color)
  const evalBeforeText = moverScoreText(ply.before, color)
  const evalAfterText = moverScoreText(ply.after, color)
  const mateForMover = (ply.after.mate !== undefined && s * ply.after.mate > 0) || mateBy === color

  const gave = (): PieceLetter[] => [materials[index + 1]?.captured].filter((x): x is PieceLetter => !!x)
  const took = (): PieceLetter[] => (mat.captured ? [mat.captured] : [])
  const patterns: MomentPattern[] = []

  const lost = -Math.min(netAfterMove, netAfterReply)
  if (-netAfterReply >= MIN_MATERIAL && (mateForMover || after >= before - EQUAL_TOLERANCE_CP)) {
    const checks = window.slice(1).some((p) => p.color === color && p.san.includes('+'))
    const buys = mateForMover ? 'mate'
      : windowNet >= -1 ? 'material'
      : after - before >= SACRIFICE_GAIN_CP || checks ? 'attack'
      : 'positional'
    patterns.push({ kind: 'sacrifice', amount: -netAfterReply, gave: gave(), took: took(), buys, evalBefore: evalBeforeText, evalAfter: evalAfterText })
  } else if (lost >= MIN_MATERIAL && before - after >= BLUNDER_DROP_CP && !mateForMover) {
    patterns.push({ kind: 'blunder-hanging', amount: lost, gave: gave(), evalBefore: evalBeforeText, evalAfter: evalAfterText })
  }
  if (mateForMover) {
    patterns.push({ kind: 'mating-attack', mateIn: ply.after.mate !== undefined ? s * ply.after.mate : undefined })
  }
  if (windowNet >= MIN_MATERIAL && captures >= 2 && after >= before - BLUNDER_DROP_CP && !patterns.some((p) => p.kind === 'sacrifice')) {
    patterns.push({ kind: 'winning-capture-sequence', amount: windowNet, captures })
  }

  return {
    ply: index + 1, moveNumber: ply.moveNumber, color, san: ply.san, fen: ply.fenBefore, fenAfter: ply.fenAfter,
    evalBefore: ply.before, evalAfter: ply.after, evalBeforeText, evalAfterText,
    best: ply.best, second: ply.second,
    materialBefore: mat.before, materialAfter: mat.after, leadBefore, played, ending, patterns,
  }
}

const pieces = (list: PieceLetter[]) => (list.length ? list.map((p) => `a ${NAMES[p]}`).join(' and ') : 'nothing')

/** A pattern as one plain English sentence for the model. */
export function describePattern(p: MomentPattern): string {
  switch (p.kind) {
    case 'sacrifice': {
      const buys = {
        mate: 'the plan is a mating attack',
        material: 'the material comes back soon after',
        attack: 'the plan is the attack',
        positional: 'the compensation is positional (no material comes back)',
      }[p.buys]
      return `sacrifice: gives ${pieces(p.gave)} for ${pieces(p.took)} (net −${p.amount}) but the evaluation goes from ${p.evalBefore} to ${p.evalAfter}: ${buys}.`
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
