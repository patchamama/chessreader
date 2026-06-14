import { useEffect, useRef } from 'react'
import type { GameTree } from '@chess-ebook/chess-shared'

interface VariationChooserProps {
  tree: GameTree
  /** mainline successor node id (the default continuation) */
  mainlineId: string
  /** variation lines that replace the successor (each is an array of node ids) */
  siblingLines: string[][]
  onPickMainline: () => void
  onPickLine: (lineIndex: number) => void
  onClose: () => void
}

function label(tree: GameTree, nodeId: string): string {
  const n = tree.nodes.get(nodeId)
  if (!n) return '?'
  return `${n.moveNumber}${n.color === 'white' ? '.' : '...'}${n.rawSan ?? n.san}`
}

export function VariationChooser({
  tree,
  mainlineId,
  siblingLines,
  onPickMainline,
  onPickLine,
  onClose,
}: VariationChooserProps) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose()
    }
    document.addEventListener('keydown', onKey)
    document.addEventListener('mousedown', onClick)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('mousedown', onClick)
    }
  }, [onClose])

  return (
    <div
      ref={ref}
      role="menu"
      aria-label="Choose continuation"
      className="absolute z-40 mt-1 w-44 rounded-lg border border-slate-200 bg-white py-1 shadow-lg"
    >
      <button
        role="menuitem"
        onClick={onPickMainline}
        className="flex w-full items-center justify-between px-3 py-1.5 text-left text-xs hover:bg-blue-50"
      >
        <span className="font-semibold text-slate-700">Mainline</span>
        <span className="font-mono text-slate-500">{label(tree, mainlineId)}</span>
      </button>
      {siblingLines.map((line, i) => (
        <button
          key={i}
          role="menuitem"
          onClick={() => onPickLine(i)}
          className="flex w-full items-center justify-between px-3 py-1.5 text-left text-xs hover:bg-emerald-50"
        >
          <span className="text-slate-600">Variation {i + 1}</span>
          <span className="font-mono text-slate-500">{label(tree, line[0])}</span>
        </button>
      ))}
    </div>
  )
}
