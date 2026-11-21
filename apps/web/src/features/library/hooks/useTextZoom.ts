import { useCallback, useState } from 'react'

export const ZOOM_KEY = 'reader-text-zoom'
export const ZOOM_MIN = 60
export const ZOOM_MAX = 200
export const ZOOM_STEP = 10
export const ZOOM_DEFAULT = 100

function read(): number {
  try {
    const n = Number(localStorage.getItem(ZOOM_KEY))
    if (Number.isInteger(n) && n >= ZOOM_MIN && n <= ZOOM_MAX) return n
  } catch { /* storage unavailable */ }
  return ZOOM_DEFAULT
}

/** Zoom percentage of the reader's book text only, remembered per browser. */
export function useTextZoom() {
  const [zoom, setZoom] = useState(read)
  const set = useCallback((next: number) => {
    const v = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, next))
    setZoom(v)
    try { localStorage.setItem(ZOOM_KEY, String(v)) } catch { /* ignore */ }
  }, [])
  const zoomIn = useCallback(() => setZoom((z) => { const v = Math.min(ZOOM_MAX, z + ZOOM_STEP); try { localStorage.setItem(ZOOM_KEY, String(v)) } catch { /* ignore */ } return v }), [])
  const zoomOut = useCallback(() => setZoom((z) => { const v = Math.max(ZOOM_MIN, z - ZOOM_STEP); try { localStorage.setItem(ZOOM_KEY, String(v)) } catch { /* ignore */ } return v }), [])
  const reset = useCallback(() => set(ZOOM_DEFAULT), [set])
  return { zoom, zoomIn, zoomOut, reset }
}
