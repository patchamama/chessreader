import { useEffect, useRef } from 'react'
import type { GameTree } from '@chess-ebook/chess-shared'
import { formatSan } from '../../../shared/chess/notation'
import type { AppLanguage, NotationStyle } from '../../../shared/settings/settingsStore'

interface VariationChooserProps {
  tree: GameTree
  /** mainline successor node id (the default continuation) */
  mainlineId: string
  /** variation lines that replace the successor (each is an array of node ids) */
  siblingLines: string[][]
  onPickMainline: () => void
  onPickLine: (lineIndex: number) => void
  onClose: () => void
  /** The notation of the viewer: the moves are shown with its piece letters (or figurines), whatever language the book used. */
  lang?: AppLanguage
  style?: NotationStyle
}

function label(tree: GameTree, nodeId: string, lang?: AppLanguage, style?: NotationStyle): string {
  const n = tree.nodes.get(nodeId)
  if (!n) return '?'
  // `san` is the move in English letters whatever the book printed; only without a chosen notation is the book's spelling kept.
  const move = lang && style ? formatSan(n.san, lang, style) : (n.rawSan ?? n.san)
  return `${n.moveNumber}${n.color === 'white' ? '.' : '...'}${move}`
}

export function VariationChooser({
  tree,
  mainlineId,
  siblingLines,
  onPickMainline,
  onPickLine,
  onClose,
  lang,
  style,
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
        <span className="font-mono text-slate-500">{label(tree, mainlineId, lang, style)}</span>
      </button>
      {siblingLines.map((line, i) => (
        <button
          key={i}
          role="menuitem"
          onClick={() => onPickLine(i)}
          className="flex w-full items-center justify-between px-3 py-1.5 text-left text-xs hover:bg-emerald-50"
        >
          <span className="text-slate-600">Variation {i + 1}</span>
          <span className="font-mono text-slate-500">{label(tree, line[0], lang, style)}</span>
        </button>
      ))}
    </div>
  )
}
