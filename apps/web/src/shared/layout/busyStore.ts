import { create } from 'zustand'

/** Long tasks running now (opening a commented game, a book, regenerating…): the app shows a spinner. */
interface BusyState {
  tasks: { id: number; label: string }[]
}

export const useBusyStore = create<BusyState>(() => ({ tasks: [] }))

let next = 1

/** Run a task with the spinner shown (label: what is happening); the spinner goes away when it ends or fails. */
export async function withBusy<T>(label: string, task: () => Promise<T>): Promise<T> {
  const id = next++
  useBusyStore.setState((s) => ({ tasks: [...s.tasks, { id, label }] }))
  try {
    return await task()
  } finally {
    useBusyStore.setState((s) => ({ tasks: s.tasks.filter((t) => t.id !== id) }))
  }
}

/** Resolve after the browser had a chance to paint (so a spinner shows before heavy synchronous work). */
export function nextPaint(): Promise<void> {
  return new Promise((resolve) => {
    if (typeof requestAnimationFrame === 'function') requestAnimationFrame(() => setTimeout(resolve, 0))
    else setTimeout(resolve, 16)
  })
}
