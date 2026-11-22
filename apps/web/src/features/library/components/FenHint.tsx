import { useId, useState } from 'react'
import { boardSvgDataUrl } from '../utils/boardSvg'

/**
 * A small "FEN" symbol shown ABOVE a book diagram (outside it, with the other icons)
 * whose FEN line the text prints next to it (that line is hidden from the prose). Hovering, focusing or
 * clicking it shows the FEN and the position it describes.
 */
export function FenHint({ fen }: { fen: string }) {
  const [open, setOpen] = useState(false)
  const [pinned, setPinned] = useState(false)
  const id = useId()
  const shown = open || pinned
  return (
    <span
      className="absolute bottom-full left-0 z-10 mb-0.5"
      data-no-recognition="true"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <button
        type="button"
        aria-label="Show FEN"
        title="Show FEN"
        aria-expanded={shown}
        aria-describedby={shown ? id : undefined}
        onClick={() => setPinned((v) => !v)}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onKeyDown={(e) => { if (e.key === 'Escape') { setPinned(false); setOpen(false) } }}
        className="flex h-5 items-center justify-center rounded border border-slate-300 bg-white/90 px-1 font-mono text-[10px] font-semibold text-slate-700 shadow-sm transition hover:bg-white"
      >
        FEN
      </button>
      {shown && (
        <span
          id={id}
          role="tooltip"
          className="absolute left-0 top-6 z-20 block w-56 rounded-md border border-slate-200 bg-white p-2 text-left shadow-lg"
        >
          <img src={boardSvgDataUrl(fen)} alt="FEN diagram" className="block h-auto w-full" />
          <code className="mt-1 block select-all break-all font-mono text-[10px] leading-snug text-slate-700">{fen}</code>
        </span>
      )}
    </span>
  )
}
