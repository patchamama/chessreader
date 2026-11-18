import { useState, type MouseEvent } from 'react'
import ChessBoardThemed from './ChessBoard'
import { useSettingsStore } from '../settings/settingsStore'

import type { LinePosition } from './playLine'



/**
 * A written line whose moves show their position on hover (when move
 * thumbnails are on in Settings). Number tokens ("3." "3...") are skipped; the
 * other tokens map, in order, to `positions`. With `onPick`, each move is a
 * button and `current` marks the move shown on a replay board.
 */
export function HoverLine({ text, positions, className, testId, suffix, current, onPick }: {
  text: string; positions: LinePosition[]; className?: string; testId?: string; suffix?: string
  current?: number; onPick?: (i: number) => void
}) {
  const thumbs = useSettingsStore((s) => s.diagramEvalThumbs)
  const [hover, setHover] = useState<{ i: number; x: number; y: number } | null>(null)
  if (!thumbs && !onPick) return <span data-testid={testId} className={className}>{text}{suffix}</span>
  let k = -1
  const parts = text.split(/(\s+)/).map((tok, j) => {
    if (!tok || /^\s+$/.test(tok) || /^\d+\.(\.\.)?$/.test(tok)) return <span key={j}>{tok}</span>
    const at = ++k
    const handlers = thumbs
      ? { onMouseEnter: (e: MouseEvent) => setHover({ i: at, x: e.clientX, y: e.clientY }), onMouseLeave: () => setHover(null) }
      : {}
    const mark = at === current ? ' bg-amber-200 font-semibold' : ''
    return onPick
      ? <button key={j} type="button" data-move-thumb className={`rounded px-0.5 hover:bg-amber-100${mark}`} onClick={() => onPick(at)} {...handlers}>{tok}</button>
      : <span key={j} data-move-thumb className={`cursor-default rounded hover:bg-amber-100${mark}`} {...handlers}>{tok}</span>
  })
  const shown = hover ? positions[hover.i] : null
  return (
    <span data-testid={testId} className={className}>
      {parts}{suffix}
      {shown && hover && (
        <span className="pointer-events-none fixed z-50 block overflow-hidden rounded border border-slate-300 bg-white shadow-lg" style={{ left: hover.x + 8, top: hover.y + 12, width: 160 }}>
          <ChessBoardThemed fen={shown.fen} orientation="white" lastMove={{ from: shown.from, to: shown.to }} hideLabels />
        </span>
      )}
    </span>
  )
}
