import { Chess } from 'chess.js'

/** A score from White's side: "+0.35", "-1.20", "#3", "-#2". */
export function scoreText(s: { scoreCp?: number; mate?: number }): string {
  if (s.mate !== undefined) return s.mate < 0 ? `-#${-s.mate}` : `#${s.mate}`
  if (s.scoreCp === undefined) return ''
  return `${s.scoreCp > 0 ? '+' : ''}${(s.scoreCp / 100).toFixed(2)}`
}

/** The engine's best line (UCI) as SAN moves from the position, as far as it is legal. */
export function pvToSan(fen: string, pv: string[]): string[] {
  const out: string[] = []
  try {
    const c = new Chess(fen)
    for (const m of pv) out.push(c.move({ from: m.slice(0, 2), to: m.slice(2, 4), promotion: m[4] }).san)
  } catch { /* the line stops at the first move that does not fit */ }
  return out
}
