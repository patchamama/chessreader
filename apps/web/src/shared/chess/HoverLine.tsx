import { useState, type MouseEvent } from 'react'
import ChessBoardThemed from './ChessBoard'
import { useSettingsStore } from '../settings/settingsStore'
import { useNotation } from './notation'
import { CapturedBadge } from './CapturedBadge'

import type { LinePosition } from './playLine'



/**
 * A written line whose moves show their position on hover (when move
 * thumbnails are on in Settings). Number tokens ("3." "3...") are skipped; the
 * other tokens map, in order, to `positions`. With `onPick`, each move is a
 * button and `current` marks the move shown on a replay board. Each move is
 * written with the chosen notation (figurines or the language's letters),
 * whatever language the text came in: its position says which piece moved.
 */
export function HoverLine({ text, positions, className, testId, suffix, current, onPick }: {
  text: string; positions: LinePosition[]; className?: string; testId?: string; suffix?: string
  current?: number; onPick?: (i: number) => void
}) {
  const thumbs = useSettingsStore((s) => s.diagramEvalThumbs)
  const notation = useNotation()
  const [hover, setHover] = useState<{ i: number; x: number; y: number } | null>(null)
  let k = -1
  const isMove = (tok: string) => !!tok && !/^\s+$/.test(tok) && !/^\d+\.(\.\.)?$/.test(tok)
  if (!thumbs && !onPick) {
    const shownText = text.split(/(\s+)/).map((tok) => (isMove(tok) ? notation.token(tok, positions[++k]?.san) : tok)).join('')
    return <span data-testid={testId} className={className}>{shownText}{suffix}</span>
  }
  const parts = text.split(/(\s+)/).map((raw, j) => {
    if (!isMove(raw)) return <span key={j}>{raw}</span>
    const at = ++k
    const tok = notation.token(raw, positions[at]?.san)
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
          <span className="relative block">
            <ChessBoardThemed fen={shown.fen} orientation="white" lastMove={{ from: shown.from, to: shown.to }} hideLabels />
            <CapturedBadge piece={shown.captured} />
          </span>
        </span>
      )}
    </span>
  )
}
