import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'

/** What can be marked as opened: a game of the database, a library (server) book, a book of the resources. */
export type VisitedKind = 'game' | 'serverBook' | 'repoBook'

export const VISITED_STORAGE_KEY = 'chessreader-visited'

interface VisitedState {
  /** `<kind>:<id>` → when it was last opened (ms). */
  visited: Record<string, number>
}

const keyOf = (kind: VisitedKind, id: string | number) => `${kind}:${id}`

/** localStorage, quietly: a full or blocked storage only means the marks are not kept. */
const safeStorage = createJSONStorage(() => ({
  getItem: (k: string) => { try { return localStorage.getItem(k) } catch { return null } },
  setItem: (k: string, v: string) => { try { localStorage.setItem(k, v) } catch { /* not kept */ } },
  removeItem: (k: string) => { try { localStorage.removeItem(k) } catch { /* nothing */ } },
}))

/** The games and books already opened in this browser, so lists can show them apart. */
const useVisitedStore = create<VisitedState>()(
  persist(() => ({ visited: {} }), { name: VISITED_STORAGE_KEY, storage: safeStorage }),
)

export function markVisited(kind: VisitedKind, id: string | number): void {
  useVisitedStore.setState((s) => ({ visited: { ...s.visited, [keyOf(kind, id)]: Date.now() } }))
}

export function isVisited(kind: VisitedKind, id: string | number): boolean {
  return keyOf(kind, id) in useVisitedStore.getState().visited
}

/** Whether the item was opened; re-renders when it is. */
export function useVisited(kind: VisitedKind, id: string | number): boolean {
  return useVisitedStore((s) => keyOf(kind, id) in s.visited)
}

/** A check for many items at once (lists); re-renders when any mark changes. */
export function useVisitedCheck(): (kind: VisitedKind, id: string | number) => boolean {
  const visited = useVisitedStore((s) => s.visited)
  return (kind, id) => keyOf(kind, id) in visited
}

/** Forget every mark (tests). */
export function resetVisited(): void {
  useVisitedStore.setState({ visited: {} })
}
