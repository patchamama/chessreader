import type { CSSProperties } from 'react'
import type { Arrow } from 'react-chessboard'
import type { BoardCue, CueRole, Lang } from '@chess-ebook/chess-shared'

/**
 * Screen rendering of board cues: each semantic role gets a colour. A physical
 * board with lights would map the same roles to its LEDs.
 */
export const CUE_COLORS: Record<CueRole, string> = {
  mention: '#3b82f6',
  piece: '#eab308',
  attacker: '#f97316',
  target: '#ef4444',
  defender: '#22c55e',
  line: '#06b6d4',
  pawn: '#a855f7',
  from: '#84cc16',
  to: '#65a30d',
  capture: '#dc2626',
  check: '#be123c',
}

export const CUE_LABELS: Record<Lang, Record<CueRole, string>> = {
  es: {
    mention: 'Casilla mencionada', piece: 'Pieza mencionada', attacker: 'Ataca', target: 'Atacada',
    defender: 'Defiende', line: 'Diagonal, columna o fila', pawn: 'Peones', from: 'Origen',
    to: 'Destino', capture: 'Captura', check: 'Jaque',
  },
  en: {
    mention: 'Square mentioned', piece: 'Piece mentioned', attacker: 'Attacks', target: 'Attacked',
    defender: 'Defends', line: 'Diagonal, file or rank', pawn: 'Pawns', from: 'From',
    to: 'To', capture: 'Capture', check: 'Check',
  },
}

const CUE_ARROW_COLORS = new Set(Object.values(CUE_COLORS))
/** true for an arrow drawn by a cue (so it is never saved as a user annotation). */
export const isCueArrow = (a: Arrow) => CUE_ARROW_COLORS.has(a.color)

const rgba = (hex: string, alpha: number) => {
  const n = parseInt(hex.slice(1), 16)
  return `rgba(${n >> 16}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`
}

export interface CueBoard {
  squareStyles: Record<string, CSSProperties>
  arrows: Arrow[]
  /** Roles on the board right now, for the legend. */
  roles: CueRole[]
}

/** Lines sit under everything; a square named twice keeps its strongest role. */
const WEIGHT: Record<CueRole, number> = {
  line: 0, mention: 1, pawn: 2, from: 2, to: 3, piece: 4, defender: 5, attacker: 6, capture: 6, target: 7, check: 8,
}

export function cuesToBoard(cues: BoardCue[]): CueBoard {
  const best = new Map<string, { role: CueRole; blink: boolean }>()
  for (const cue of cues) {
    for (const s of cue.squares) {
      const cur = best.get(s.square)
      if (!cur || WEIGHT[s.role] >= WEIGHT[cur.role]) best.set(s.square, { role: s.role, blink: !!s.blink })
    }
  }
  const squareStyles: Record<string, CSSProperties> = {}
  for (const [square, { role, blink }] of best) {
    const color = CUE_COLORS[role]
    squareStyles[square] = {
      backgroundColor: rgba(color, role === 'line' ? 0.3 : 0.45),
      boxShadow: `inset 0 0 0 3px ${color}`,
      ...(blink ? { animation: 'cue-blink 0.9s ease-in-out infinite' } : {}),
    }
  }
  const arrows: Arrow[] = []
  for (const cue of cues) {
    for (const a of cue.arrows) {
      if (arrows.some((x) => x.startSquare === a.from && x.endSquare === a.to)) continue
      arrows.push({ startSquare: a.from, endSquare: a.to, color: CUE_COLORS[a.role] })
    }
  }
  return { squareStyles, arrows, roles: [...new Set([...best.values()].map((b) => b.role))] }
}
