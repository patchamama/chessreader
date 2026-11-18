import { create } from 'zustand'

/** One piece of what is happening on the page shown (the footer lists them in order). */
export interface StatusItem { key: string; label: string; value: string }

interface StatusState {
  items: StatusItem[]
  /** Publish or update a piece of status; an empty value removes it. */
  setStatus: (key: string, label: string, value: string) => void
  /** Remove every piece whose key starts with `prefix` (a page leaving). */
  clearStatus: (prefix: string) => void
}

/** What the page shown publishes for the status footer: position, evaluation, mode, time… */
export const useStatusStore = create<StatusState>((set) => ({
  items: [],
  setStatus: (key, label, value) => set((s) => {
    const rest = s.items.filter((i) => i.key !== key)
    if (!value) return { items: rest }
    const at = s.items.findIndex((i) => i.key === key)
    const item = { key, label, value }
    if (at < 0) return { items: [...rest, item] }
    const items = [...s.items]
    items[at] = item
    return { items }
  }),
  clearStatus: (prefix) => set((s) => ({ items: s.items.filter((i) => !i.key.startsWith(prefix)) })),
}))
