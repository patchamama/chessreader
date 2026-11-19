import { useState } from 'react'
import type { GameTree } from '@chess-ebook/chess-shared'
import { useNotation } from '../../../shared/chess/notation'
import { MoveTooltipCard } from '../components/MoveTooltipCard'
import { CUE_COLORS } from '../narration/cueStyles'
import { useLineQualities } from './useLineQualities'

/**
 * The moves of a line, beside the board: each one clickable, coloured by how
 * good it is (the colours of the board's move hints) and, hovered, the
 * thumbnail of the position after it with the engine's verdict.
 *
 * The list keeps its own height (moves at the top, normal line spacing): it
 * never stretches to the height of the board next to it.
 */
export function AnalysisMoveList({ label, tree, ids, currentId, onSelect }: {
  label: string
  tree: GameTree
  ids: string[]
  currentId: string | null
  onSelect: (id: string) => void
}) {
  const notation = useNotation()
  const qualities = useLineQualities(tree, ids)
  const [hover, setHover] = useState<{ id: string; x: number; y: number } | null>(null)
  const hovered = hover ? tree.nodes.get(hover.id) : undefined

  return (
    <>
      <ol aria-label={label} className="flex flex-wrap content-start items-baseline self-start gap-x-1 gap-y-0.5 font-mono text-sm leading-6 text-slate-700">
        {ids.map((id, i) => {
          const node = tree.nodes.get(id)
          if (!node) return null
          const prefix = node.color === 'white' ? `${node.moveNumber}.` : i === 0 ? `${node.moveNumber}...` : ''
          const current = id === currentId
          const quality = qualities[id]
          return (
            <li key={id} className="inline-flex items-center gap-0.5">
              {prefix && <span className="text-slate-400">{prefix}</span>}
              <button
                type="button"
                aria-current={current ? 'true' : undefined}
                data-quality={quality}
                style={quality ? { color: CUE_COLORS[quality], fontWeight: 600 } : undefined}
                className={`rounded px-0.5 hover:bg-amber-100${current ? ' bg-amber-200 font-semibold' : ''}`}
                onClick={() => onSelect(id)}
                onMouseEnter={(e) => setHover({ id, x: e.clientX, y: e.clientY })}
                onMouseLeave={() => setHover(null)}
              >
                {notation.san(node.san)}
              </button>
            </li>
          )
        })}
      </ol>
      {hovered && hover && (
        <div
          data-testid="move-thumbnail"
          className="pointer-events-none fixed z-[70] overflow-hidden rounded-lg border border-slate-300 bg-white text-slate-900 shadow-xl"
          style={{ left: Math.min(hover.x + 12, window.innerWidth - 230), top: Math.max(8, hover.y - 300) }}
        >
          <MoveTooltipCard tree={tree} node={hovered} fen={hovered.fen} lastMove={hovered.from ? { from: hovered.from, to: hovered.to } : null} />
        </div>
      )}
    </>
  )
}
