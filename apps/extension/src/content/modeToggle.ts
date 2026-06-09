/**
 * modeToggle.ts
 *
 * Persists the current display mode (normal | substitution) via chrome.storage.
 */

export type DisplayMode = 'normal' | 'substitution'

const STORAGE_KEY = 'displayMode'

export async function getMode(): Promise<DisplayMode> {
  const result = await chrome.storage.local.get(STORAGE_KEY)
  return (result[STORAGE_KEY] as DisplayMode) ?? 'normal'
}

export async function setMode(mode: DisplayMode): Promise<void> {
  await chrome.storage.local.set({ [STORAGE_KEY]: mode })
}
