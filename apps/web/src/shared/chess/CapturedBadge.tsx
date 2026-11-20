import { pieceGlyph } from './capturedPiece'

const NAMES: Record<string, string> = { p: 'pawn', n: 'knight', b: 'bishop', r: 'rook', q: 'queen', k: 'king' }

/** The piece a move took, shown in a corner of a thumbnail (S13). */
export function CapturedBadge({ piece }: { piece: string | null | undefined }) {
  if (!piece) return null
  const label = `Captured: ${piece === piece.toUpperCase() ? 'white' : 'black'} ${NAMES[piece.toLowerCase()] ?? piece}`
  return (
    <span
      data-testid="captured-piece"
      title={label}
      aria-label={label}
      className="pointer-events-none absolute bottom-1 right-1 z-10 flex h-6 min-w-6 items-center justify-center rounded border border-red-300 bg-white/90 px-0.5 text-base leading-none text-slate-900 shadow"
    >
      <span aria-hidden className="mr-0.5 text-[10px] text-red-600">✕</span>{pieceGlyph(piece)}
    </span>
  )
}
