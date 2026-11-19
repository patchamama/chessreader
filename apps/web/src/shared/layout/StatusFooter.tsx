import { useSettingsStore } from '../settings/settingsStore'
import { useStatusStore, visibleStatus } from './statusStore'
import { useBusyStore, type BusyTask } from './busyStore'

/** Height of the status footer, read by full-height pages (the reader). */
export const FOOTER_HEIGHT = 28

/** The bar of a long task: a fill for its fraction, or a pulsing bar when it cannot tell. */
function Bar({ task, className }: { task: BusyTask; className: string }) {
  const percent = task.progress === undefined ? undefined : Math.round(task.progress * 100)
  return (
    <div role="progressbar" aria-label={task.label} aria-valuemin={0} aria-valuemax={100}
      {...(percent === undefined ? {} : { 'aria-valuenow': percent })}
      className={`overflow-hidden bg-slate-700 ${className}`}>
      <div className={`h-full bg-sky-400 transition-[width] duration-200 ${percent === undefined ? 'w-full animate-pulse' : ''}`}
        style={percent === undefined ? undefined : { width: `${percent}%` }} />
    </div>
  )
}

function CancelButton({ task }: { task: BusyTask }) {
  if (!task.cancel) return null
  return (
    <button type="button" aria-label={`Cancel ${task.label}`} title="Cancel" onClick={task.cancel}
      className="rounded px-1 text-slate-300 hover:bg-slate-700 hover:text-white">✕</button>
  )
}

/**
 * A thin bar at the bottom of the window with what is happening on the page:
 * the book, game and move, the position (FEN), the evaluation and engine, the
 * game mode and clocks, and the progress of a long task (S5). It can be
 * hidden; a running task still shows a thin bar then.
 */
export function StatusFooter() {
  const all = useStatusStore((s) => s.items)
  const hiddenScopes = useStatusStore((s) => s.hiddenScopes)
  const items = visibleStatus(all, hiddenScopes)
  const task = useBusyStore((s) => s.tasks[s.tasks.length - 1])
  const show = useSettingsStore((s) => s.statusFooter)
  const set = useSettingsStore((s) => s.set)
  if (!show) {
    return (
      <>
        {task && (
          <div className="fixed inset-x-0 bottom-0 z-40 flex items-center" title={task.label}>
            <Bar task={task} className="h-1 flex-1" />
          </div>
        )}
        <button aria-label="Show the status bar" title="Show the status bar" onClick={() => set({ statusFooter: true })}
          className="fixed bottom-1 right-1 z-40 rounded bg-slate-800/80 px-1.5 text-[11px] text-white">▴</button>
      </>
    )
  }
  const percent = task?.progress === undefined ? null : Math.round(task.progress * 100)
  return (
    <footer role="status" aria-label="Status" data-testid="status-footer" style={{ height: FOOTER_HEIGHT }}
      className="fixed inset-x-0 bottom-0 z-40 flex items-center gap-4 overflow-x-auto whitespace-nowrap border-t border-slate-700 bg-slate-900 px-3 text-[11px] text-slate-200">
      {task && (
        <span className="flex shrink-0 items-center gap-2" data-testid="status-progress">
          <span className="text-sky-300">{task.label}</span>
          <Bar task={task} className="h-1.5 w-40 rounded-full" />
          {percent !== null && <span className="font-mono">{percent}%</span>}
          <CancelButton task={task} />
        </span>
      )}
      {items.length === 0 && !task && <span className="text-slate-500">—</span>}
      {items.map((i) => (
        <span key={i.key}><span className="text-slate-400">{i.label}:</span> <span className="font-mono">{i.value}</span></span>
      ))}
      <button aria-label="Hide the status bar" title="Hide the status bar" onClick={() => set({ statusFooter: false })}
        className="ml-auto rounded px-1 text-slate-400 hover:text-white">▾</button>
    </footer>
  )
}
