import type { WrongMoveFix } from '@chess-ebook/chess-shared'
import { checkMoves } from '../correction/workbench'

/**
 * Helpers of the wrong-move finder panel: apply a ranked fix to the printed main
 * line, preview how much of the game it reads, and ask an LLM to rank the fixes
 * against the printed text (the LLM never applies anything).
 */

/** "3." for White's third move, "3..." for Black's (0-based ply). */
export const plyLabel = (ply: number) => `${Math.floor(ply / 2) + 1}${ply % 2 === 0 ? '.' : '...'}`

/** The printed list with the fix applied. */
export function applyFix(sans: string[], fix: WrongMoveFix): string[] {
  const out = [...sans]
  switch (fix.kind) {
    case 'substitute': out[fix.ply] = fix.to; break
    case 'delete': out.splice(fix.ply, 1); break
    case 'insert': out.splice(fix.ply, 0, fix.to); break
    case 'swap': out.splice(fix.ply, 2, ...fix.to.split(/\s+/).slice(0, 2)); break
  }
  return out
}

/** How many moves of the game are read (legal from the start) after the fix. */
export function previewFix(sans: string[], fix: WrongMoveFix, startFen: string): { read: number; total: number } {
  const fixed = applyFix(sans, fix)
  return { read: checkMoves(fixed, { startFen }).legal, total: fixed.length }
}

/** "12... Qxb2 → Qb5 (substitute)", "3... + a6 (insert)", "3... − Ba4 (delete)". */
export function fixLabel(fix: WrongMoveFix): string {
  const at = plyLabel(fix.ply)
  if (fix.kind === 'insert') return `${at} + ${fix.to} (insert)`
  if (fix.kind === 'delete') return `${at} − ${fix.from} (delete)`
  return `${at} ${fix.from} → ${fix.to} (${fix.kind})`
}

export const RANK_SYSTEM =
  'You check transcriptions of printed chess games. A move of the printed game is wrong (an OCR or printing error) and the game stops being legal at the failing move. ' +
  'Given the printed text around it and candidate fixes found by a legal-move search, pick the fix most likely to restore what the author wrote. ' +
  'Answer only JSON: {"best": <the number of the fix>, "reason": "<one or two sentences>"}.'

/** Plies of the printed text sent on each side of the failing one. */
export const CONTEXT_PLIES = 6

export interface RankInput {
  /** The printed main line, as written. */
  moves: { written: string }[]
  failingPly: number
  /** The printed text around the failing move (original notation). */
  excerpt: string
  fixes: WrongMoveFix[]
}

/** The question for the LLM: the printed moves around the failing ply and the numbered fixes. */
export function rankPrompt(input: RankInput): string {
  const from = Math.max(0, input.failingPly - CONTEXT_PLIES)
  const to = Math.min(input.moves.length, input.failingPly + CONTEXT_PLIES + 1)
  const printed = input.moves.slice(from, to).map((m, i) => `${plyLabel(from + i)} ${m.written}`).join('  ')
  const fixes = input.fixes.map((f, i) => `${i + 1}. ${fixLabel(f)}, then ${f.playedAfter} later moves play${f.complete ? ' (the whole game)' : ''}`)
  return [
    `Printed text:\n${input.excerpt}`,
    `Printed moves (failing: ${plyLabel(input.failingPly)} ${input.moves[input.failingPly]?.written ?? ''}):\n${printed}`,
    `Candidate fixes:\n${fixes.join('\n')}`,
  ].join('\n\n')
}

/** The LLM's pick (0-based) and reason, or null when the answer is not usable. */
export function parseRank(text: string, count: number): { best: number; reason: string } | null {
  const json = text.match(/\{[\s\S]*\}/)?.[0]
  if (!json) return null
  try {
    const v = JSON.parse(json) as { best?: unknown; reason?: unknown }
    const best = Number(v.best)
    if (!Number.isInteger(best) || best < 1 || best > count) return null
    return { best: best - 1, reason: typeof v.reason === 'string' ? v.reason : '' }
  } catch {
    return null
  }
}
