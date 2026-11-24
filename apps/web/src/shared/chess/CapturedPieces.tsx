import { capturedPieces, pieceGlyph } from './captured'

const VALUE: Record<string, number> = { p: 1, n: 3, b: 3, r: 5, q: 9 }

/** The material lead in pawns: positive when White is ahead, negative when Black is. */
export function materialBalance(fen: string): number {
  const { white, black } = capturedPieces(fen)
  const sum = (pieces: string[]) => pieces.reduce((n, p) => n + (VALUE[p.toLowerCase()] ?? 0), 0)
  return sum(white) - sum(black)
}

/**
 * The pieces `side` has taken so far, as small figurines (most valuable first), with the
 * material lead ("+3") when that side is ahead. Read from the pieces missing on the board.
 */
export function CapturedPieces({ fen, side }: { fen: string; side: 'white' | 'black' }) {
  const pieces = capturedPieces(fen)[side]
  const lead = side === 'white' ? materialBalance(fen) : -materialBalance(fen)
  return (
    <div data-testid={`captured-${side}`} className="flex h-4 flex-wrap items-center gap-px text-sm leading-none text-slate-600" aria-label={`Pieces taken by ${side}`}>
      {pieces.map((p, i) => <span key={i} className={p === p.toUpperCase() ? 'text-slate-400' : 'text-slate-800'}>{pieceGlyph(p)}</span>)}
      {lead > 0 && <span className="ml-1 text-[10px] font-semibold text-slate-500">+{lead}</span>}
    </div>
  )
}
