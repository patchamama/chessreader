import { useSettingsStore } from '../settings/settingsStore'
import { useStatusStore } from './statusStore'

/** Height of the status footer, read by full-height pages (the reader). */
export const FOOTER_HEIGHT = 28

/**
 * A thin bar at the bottom of the window with what is happening on the page:
 * the book, game and move, the position (FEN), the evaluation and engine, the
 * game mode and clocks. It can be hidden.
 */
export function StatusFooter() {
  const items = useStatusStore((s) => s.items)
  const show = useSettingsStore((s) => s.statusFooter)
  const set = useSettingsStore((s) => s.set)
  if (!show) {
    return (
      <button aria-label="Show the status bar" title="Show the status bar" onClick={() => set({ statusFooter: true })}
        className="fixed bottom-1 right-1 z-40 rounded bg-slate-800/80 px-1.5 text-[11px] text-white">▴</button>
    )
  }
  return (
    <footer role="status" aria-label="Status" data-testid="status-footer" style={{ height: FOOTER_HEIGHT }}
      className="fixed inset-x-0 bottom-0 z-40 flex items-center gap-4 overflow-x-auto whitespace-nowrap border-t border-slate-700 bg-slate-900 px-3 text-[11px] text-slate-200">
      {items.length === 0 && <span className="text-slate-500">—</span>}
      {items.map((i) => (
        <span key={i.key}><span className="text-slate-400">{i.label}:</span> <span className="font-mono">{i.value}</span></span>
      ))}
      <button aria-label="Hide the status bar" title="Hide the status bar" onClick={() => set({ statusFooter: false })}
        className="ml-auto rounded px-1 text-slate-400 hover:text-white">▾</button>
    </footer>
  )
}
