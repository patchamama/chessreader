import { useSettingsStore } from '../settings/settingsStore'

export type PageWidth = 'normal' | 'wide' | 'full'

/** The container width for each choice (phones always use the whole width). */
export function pageWidthClass(w: PageWidth): string {
  return w === 'full' ? 'max-w-none' : w === 'wide' ? 'max-w-screen-2xl' : 'max-w-6xl'
}

/** A page's own width: its narrower default on "normal", the chosen width otherwise. */
export function usePageWidth(narrow: string): string {
  const w = useSettingsStore((s) => s.pageWidth)
  return w === 'normal' ? narrow : pageWidthClass(w)
}
