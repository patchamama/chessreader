import type { SquareReading } from '@chess-ebook/chess-shared'
import { distance } from './templateReader'
import { patchOf, type BankEntry } from './squareBank'

/** Mean squared difference (values 0..1) above which the nearest sample is not a real match. */
export const WEAK_DISTANCE = 0.004
/** The second best label must be at least this many times farther than the best. */
export const MARGIN_RATIO = 1.5
const MARGIN_FLOOR = 0.002
const FILES = 'abcdefgh'

export interface SquareRead {
  square: string
  /** 0..63, rank 8 first, file a first. */
  index: number
  /** The best label ('.' empty). */
  label: string
  /** Labels from the likeliest (at most 3). */
  candidates: string[]
  /** The match is weak or two labels are close: ask the user. */
  doubt: boolean
}

/**
 * Reads each square by its nearest sample in the bank, of the same square
 * colour (any colour when the bank has none of that colour, which is a doubt).
 * Nearest neighbour per label; weak matches and close labels are doubts.
 */
export function readWithBank(patches: Float32Array[], bank: BankEntry[]): SquareRead[] {
  const out: SquareRead[] = []
  for (let i = 0; i < 64 && i < patches.length; i++) {
    const r = Math.floor(i / 8), f = i % 8
    const square = `${FILES[f]}${8 - r}`
    const colour = (r + f) % 2
    const same = bank.filter((e) => e.colour === colour)
    const pool = same.length ? same : bank
    const best = new Map<string, number>()
    for (const e of pool) {
      const d = distance(patches[i], patchOf(e))
      if (d < (best.get(e.label) ?? Infinity)) best.set(e.label, d)
    }
    const ranked = [...best].sort((a, b) => a[1] - b[1])
    if (!ranked.length) { out.push({ square, index: i, label: '.', candidates: [], doubt: true }); continue }
    const [d1, d2] = [ranked[0][1], ranked[1]?.[1] ?? Infinity]
    const close = d2 < Math.max(d1 * MARGIN_RATIO, d1 + MARGIN_FLOOR)
    out.push({
      square, index: i, label: ranked[0][0], candidates: ranked.slice(0, 3).map(([l]) => l),
      doubt: !same.length || d1 > WEAK_DISTANCE || close,
    })
  }
  return out
}

/** The FEN board field of the reads (the given labels override, e.g. the user's corrections). */
export function boardOf(reads: { label: string }[]): string {
  const ranks: string[] = []
  for (let r = 0; r < 8; r++) {
    let row = '', empty = 0
    for (let f = 0; f < 8; f++) {
      const l = reads[(r * 8) + f]?.label ?? '.'
      if (l === '.') { empty++; continue }
      if (empty) row += empty
      empty = 0
      row += l
    }
    ranks.push(row + (empty ? String(empty) : ''))
  }
  return ranks.join('/')
}

/** The reads as readings for the solver (the best label with a fixed confidence, per square). */
export function readsToReadings(reads: SquareRead[]): SquareReading[] {
  return reads.map((r) => ({ square: r.square, piece: r.label === '.' ? null : r.label, confidence: r.doubt ? 0.4 : 0.9 }))
}

/**
 * Adds one more vote to the reads: a vision reading. It only reorders the
 * candidates of squares still in doubt (never an answered square, never a
 * confident read), so it never overrides what the user said.
 */
export function withVision(reads: SquareRead[], vision: SquareReading[], answered: ReadonlySet<string>): SquareRead[] {
  const best = new Map<string, SquareReading>()
  for (const v of vision) if (!best.has(v.square) || best.get(v.square)!.confidence < v.confidence) best.set(v.square, v)
  return reads.map((r) => {
    const v = best.get(r.square)
    if (!v || !r.doubt || answered.has(r.square)) return r
    const label = v.piece ?? '.'
    return { ...r, candidates: [label, ...r.candidates.filter((c) => c !== label)].slice(0, 3) }
  })
}
