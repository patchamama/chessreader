import { useBusyStore } from './busyStore'

/** A small spinner in the corner while a long task runs (see withBusy). */
export function BusyOverlay() {
  const task = useBusyStore((s) => s.tasks[s.tasks.length - 1])
  if (!task) return null
  return (
    <div role="status" aria-live="polite" className="fixed bottom-10 right-4 z-50 flex items-center gap-2 rounded-md bg-slate-900/90 px-3 py-2 text-sm text-white shadow-lg">
      <span aria-hidden="true" className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
      {task.label}
    </div>
  )
}
