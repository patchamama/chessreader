import { ZOOM_MAX, ZOOM_MIN } from '../hooks/useTextZoom'

const btn = 'flex h-9 min-w-9 items-center justify-center rounded-lg border border-slate-200 bg-white px-2 text-xs font-semibold text-slate-600 shadow-sm transition hover:bg-slate-50 hover:text-slate-900 disabled:cursor-not-allowed disabled:opacity-35'

/** Zoom out / reset / zoom in for the book text of the reader (not the board). */
export function TextZoom({ zoom, onZoomIn, onZoomOut, onReset }: { zoom: number; onZoomIn: () => void; onZoomOut: () => void; onReset: () => void }) {
  return (
    <div className="flex items-center gap-1" role="group" aria-label="Text zoom">
      <button type="button" onClick={onZoomOut} disabled={zoom <= ZOOM_MIN} title="Zoom text out" aria-label="Zoom text out" className={btn}>A−</button>
      <button type="button" onClick={onReset} title="Reset text zoom" aria-label="Reset text zoom" className={`${btn} w-14`}>{zoom}%</button>
      <button type="button" onClick={onZoomIn} disabled={zoom >= ZOOM_MAX} title="Zoom text in" aria-label="Zoom text in" className={btn}>A+</button>
    </div>
  )
}
