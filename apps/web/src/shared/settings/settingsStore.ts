import { create } from 'zustand'
import { persist } from 'zustand/middleware'

// Board color themes
export type BoardTheme =
  | 'classic'   // brown / beige
  | 'blue'      // steel blue
  | 'green'     // green felt
  | 'purple'    // purple
  | 'gray'      // monochrome
  | 'coral'     // coral / cream

export const BOARD_THEMES: Record<BoardTheme, { light: string; dark: string; label: string }> = {
  classic: { light: '#f0d9b5', dark: '#b58863', label: 'Classic' },
  blue:    { light: '#dee3e6', dark: '#5a80a7', label: 'Blue' },
  green:   { light: '#ffffdd', dark: '#86a666', label: 'Green' },
  purple:  { light: '#e8d9f0', dark: '#8e55a0', label: 'Purple' },
  gray:    { light: '#e0e0e0', dark: '#7a7a7a', label: 'Gray' },
  coral:   { light: '#fef0e6', dark: '#cc7755', label: 'Coral' },
}

export type EvalBarDirection = 'horizontal' | 'vertical'

export type FontFamily = 'serif' | 'sans' | 'mono'
export const FONT_FAMILIES: Record<FontFamily, { css: string; label: string }> = {
  serif: { css: 'Georgia, Times New Roman, serif', label: 'Serif' },
  sans:  { css: 'Inter, system-ui, sans-serif',    label: 'Sans-serif' },
  mono:  { css: 'JetBrains Mono, Courier New, monospace', label: 'Monospace' },
}

export interface AppSettings {
  boardTheme: BoardTheme
  evalBarDirection: EvalBarDirection
  fontFamily: FontFamily
  fontSize: number        // 12–22 px
  bgColor: string         // hex
  textColor: string       // hex
  marginH: number         // horizontal padding rem (0–6)
}

const DEFAULT: AppSettings = {
  boardTheme: 'classic',
  evalBarDirection: 'horizontal',
  fontFamily: 'serif',
  fontSize: 16,
  bgColor: '#ffffff',
  textColor: '#1a1a1a',
  marginH: 2,
}

interface SettingsStore extends AppSettings {
  set: (patch: Partial<AppSettings>) => void
  reset: () => void
}

export const useSettingsStore = create<SettingsStore>()(
  persist(
    (set) => ({
      ...DEFAULT,
      set: (patch) => set((s) => ({ ...s, ...patch })),
      reset: () => set({ ...DEFAULT }),
    }),
    { name: 'chessreader-settings' },
  ),
)
