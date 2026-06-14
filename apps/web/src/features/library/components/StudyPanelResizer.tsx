import { useRef } from 'react'
import { useSettingsStore } from '../../../shared/settings/settingsStore'

export const STUDY_PANEL_MIN = 240
export const STUDY_PANEL_MAX = 900
export const STUDY_PANEL_DEFAULT = 320

const clamp = (w: number) => Math.min(STUDY_PANEL_MAX, Math.max(STUDY_PANEL_MIN, w))

/**
 * A vertical drag handle that sits on the LEFT edge of the study panel.
 * Dragging it left widens the panel (and the board fills it); dragging right
 * narrows it. The width is persisted in settings; double-click resets it.
 */
export function StudyPanelResizer() {
  const width = useSettingsStore((s) => s.studyPanelWidth)
  const set = useSettingsStore((s) => s.set)

  // Drag origin captured on pointer-down: pointer X and the panel width then.
  const drag = useRef<{ startX: number; startWidth: number } | null>(null)

  const onPointerDown = (e: React.PointerEvent) => {
    e.preventDefault()
    drag.current = { startX: e.clientX, startWidth: width }
    // Pointer capture keeps move events flowing even past the thin handle.
    // jsdom (tests) doesn't implement it — guard so it never throws.
    try {
      e.currentTarget.setPointerCapture(e.pointerId)
    } catch {
      /* unsupported in test env */
    }
  }

  const onPointerMove = (e: React.PointerEvent) => {
    if (!drag.current) return
    // Handle is on the panel's left edge: moving left (smaller clientX) grows it.
    const delta = drag.current.startX - e.clientX
    set({ studyPanelWidth: clamp(drag.current.startWidth + delta) })
  }

  const endDrag = (e: React.PointerEvent) => {
    if (!drag.current) return
    drag.current = null
    try {
      e.currentTarget.releasePointerCapture(e.pointerId)
    } catch {
      /* capture may already be gone */
    }
  }

  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label="Resize study panel"
      title="Drag to resize · double-click to reset"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      onDoubleClick={() => set({ studyPanelWidth: STUDY_PANEL_DEFAULT })}
      className="group relative w-1.5 shrink-0 cursor-col-resize bg-slate-200 transition-colors hover:bg-amber-400"
    >
      {/* Wider invisible hit-area for easier grabbing. */}
      <span className="absolute inset-y-0 -left-1.5 -right-1.5" />
    </div>
  )
}
