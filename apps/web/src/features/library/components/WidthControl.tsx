import { useEffect, useRef, useState } from 'react'
import { READER_WIDTH_MAX, READER_WIDTH_MIN, useReaderViewStore } from '../store/readerViewStore'

const PRESETS: { label: string; short: string; width: number | null }[] = [
  { label: 'Narrow', short: 'Narrow', width: 560 },
  { label: 'Medium', short: 'Medium', width: 720 },
  { label: 'Wide', short: 'Wide', width: 960 },
  { label: 'Full width', short: 'Full', width: null },
]

/**
 * The width of the text column (S9), mostly for tablets and desktops: a small
 * popover with a slider and presets, applied live and remembered on this device.
 */
export function WidthControl() {
  const width = useReaderViewStore((s) => s.textWidth)
  const setWidth = useReaderViewStore((s) => s.setTextWidth)
  const [open, setOpen] = useState(false)
  const box = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const close = (e: Event) => { if (!box.current?.contains(e.target as Node)) setOpen(false) }
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('pointerdown', close)
    document.addEventListener('keydown', esc)
    return () => { document.removeEventListener('pointerdown', close); document.removeEventListener('keydown', esc) }
  }, [open])

  return (
    <div ref={box} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        title="Reading width"
        aria-label="Reading width"
        aria-expanded={open}
        aria-haspopup="dialog"
        className={`flex h-9 w-9 items-center justify-center rounded-lg border shadow-sm transition ${
          open || width !== null ? 'border-blue-400 bg-blue-50 text-blue-600' : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50 hover:text-slate-900'
        }`}
      >
        <svg aria-hidden="true" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v16M20 4v16M8 12h8M8 12l2.5-2.5M8 12l2.5 2.5M16 12l-2.5-2.5M16 12l-2.5 2.5" />
        </svg>
      </button>
      {open && (
        <div role="dialog" aria-label="Reading width" className="absolute right-0 top-11 z-30 w-64 rounded-lg border border-slate-200 bg-white p-3 text-xs text-slate-700 shadow-lg">
          <label className="flex items-center justify-between font-medium">
            <span>Text column</span>
            <span className="tabular-nums text-slate-500">{width === null ? 'full' : `${width} px`}</span>
          </label>
          <input
            type="range"
            aria-label="Text column width"
            min={READER_WIDTH_MIN}
            max={READER_WIDTH_MAX}
            step={20}
            value={width ?? READER_WIDTH_MAX}
            onChange={(e) => setWidth(Number(e.target.value))}
            className="mt-2 w-full accent-blue-600"
          />
          <div className="mt-2 grid grid-cols-4 gap-1">
            {PRESETS.map((p) => (
              <button
                key={p.label}
                type="button"
                aria-label={p.label}
                aria-pressed={width === p.width}
                onClick={() => setWidth(p.width)}
                className={`rounded border px-1 py-1 ${width === p.width ? 'border-blue-400 bg-blue-50 text-blue-700' : 'border-slate-200 hover:bg-slate-50'}`}
              >
                {p.short}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
