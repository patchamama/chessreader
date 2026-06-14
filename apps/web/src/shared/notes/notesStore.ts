import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface NotesState {
  content: string
  setContent: (content: string) => void
}

export const useNotesStore = create<NotesState>()(
  persist(
    (set) => ({
      content: '',
      setContent: (content) => set({ content }),
    }),
    { name: 'chessreader-notes' },
  ),
)

export function countPending(content: string): number {
  return (content.match(/^- \[ \]/gm) ?? []).length
}

export function countDone(content: string): number {
  return (content.match(/^- \[x\]/gmi) ?? []).length
}
