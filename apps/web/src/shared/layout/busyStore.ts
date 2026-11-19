import { create } from 'zustand'

/** One long task running now: what it does and, when it knows, how far it got (0..1). */
export interface BusyTask {
  id: number
  label: string
  /** Fraction done (0..1); undefined while the task cannot tell (an indeterminate bar). */
  progress?: number
  /** Present when the task can be stopped from the status footer. */
  cancel?: () => void
}

/** Long tasks running now (opening a commented game, a book, regenerating…): the status footer shows their progress. */
interface BusyState {
  tasks: BusyTask[]
}

export const useBusyStore = create<BusyState>(() => ({ tasks: [] }))

let next = 1

/** Report the progress of a task: `done` of `total` steps (or a fraction 0..1 when `total` is omitted). */
export type ReportProgress = (done: number, total?: number) => void

const patch = (id: number, change: Partial<BusyTask>) =>
  useBusyStore.setState((s) => ({ tasks: s.tasks.map((t) => (t.id === id ? { ...t, ...change } : t)) }))

/**
 * Run a long task with its progress shown in the status footer (S5): `report`
 * moves the bar, `signal` aborts when the user cancels (with `cancellable`).
 * The bar goes away when the task ends or fails.
 */
export async function withProgress<T>(
  label: string,
  task: (report: ReportProgress, signal: AbortSignal) => Promise<T>,
  options: { cancellable?: boolean } = {},
): Promise<T> {
  const id = next++
  const controller = new AbortController()
  const entry: BusyTask = { id, label, ...(options.cancellable ? { cancel: () => controller.abort() } : {}) }
  useBusyStore.setState((s) => ({ tasks: [...s.tasks, entry] }))
  const report: ReportProgress = (done, total) => {
    const fraction = total === undefined ? done : total > 0 ? done / total : 0
    patch(id, { progress: Math.max(0, Math.min(1, fraction)) })
  }
  try {
    return await task(report, controller.signal)
  } finally {
    useBusyStore.setState((s) => ({ tasks: s.tasks.filter((t) => t.id !== id) }))
  }
}

/** Run a task with an indeterminate progress bar (label: what is happening); it goes away when it ends or fails. */
export function withBusy<T>(label: string, task: () => Promise<T>): Promise<T> {
  return withProgress(label, () => task())
}

/** Rename a running task (e.g. "Regenerating diagrams 3/12"). */
export function relabelTask(from: string, to: string): void {
  useBusyStore.setState((s) => ({ tasks: s.tasks.map((t) => (t.label === from ? { ...t, label: to } : t)) }))
}

/** Resolve after the browser had a chance to paint (so the progress bar shows before heavy synchronous work). */
export function nextPaint(): Promise<void> {
  return new Promise((resolve) => {
    if (typeof requestAnimationFrame === 'function') requestAnimationFrame(() => setTimeout(resolve, 0))
    else setTimeout(resolve, 16)
  })
}
