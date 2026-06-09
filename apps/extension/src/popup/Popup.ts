/**
 * Popup.ts
 *
 * Mode switch (normal / substitution) persisted to chrome.storage.
 * Framework-light — pure DOM, no React needed for the popup.
 */

import { getMode, setMode, type DisplayMode } from '../content/modeToggle'

export async function initPopup(doc: Document = document): Promise<void> {
  const current = await getMode()

  const toggle = doc.getElementById('mode-toggle') as HTMLInputElement | null
  const label = doc.getElementById('mode-label')

  if (toggle) {
    toggle.checked = current === 'substitution'
    toggle.addEventListener('change', async () => {
      const newMode: DisplayMode = toggle.checked ? 'substitution' : 'normal'
      await setMode(newMode)
      if (label) label.textContent = newMode
    })
  }

  if (label) {
    label.textContent = current
  }
}
