import { describe, it, expect, vi } from 'vitest'
import { initPopup } from '../popup/Popup'

function makePopupDoc(): Document {
  const doc = document.implementation.createHTMLDocument()
  doc.body.innerHTML = `
    <label>
      <input id="mode-toggle" type="checkbox">
      Mode
    </label>
    <span id="mode-label"></span>
  `
  return doc
}

describe('Popup', () => {
  it('initialises with stored mode and reflects it in the toggle', async () => {
    vi.mocked(chrome.storage.local.get).mockImplementation(
      (_keys: unknown, cb?: (items: Record<string, unknown>) => void) => {
        const r = { displayMode: 'substitution' }
        if (cb) cb(r)
        return Promise.resolve(r) as unknown as void
      }
    )

    const doc = makePopupDoc()
    await initPopup(doc)

    const toggle = doc.getElementById('mode-toggle') as HTMLInputElement
    expect(toggle.checked).toBe(true)
    const label = doc.getElementById('mode-label')
    expect(label?.textContent).toBe('substitution')
  })

  it('persists mode change to chrome.storage on toggle', async () => {
    vi.mocked(chrome.storage.local.get).mockImplementation(
      (_keys: unknown, cb?: (items: Record<string, unknown>) => void) => {
        const r = { displayMode: 'normal' }
        if (cb) cb(r)
        return Promise.resolve(r) as unknown as void
      }
    )

    const doc = makePopupDoc()
    await initPopup(doc)

    const toggle = doc.getElementById('mode-toggle') as HTMLInputElement
    toggle.checked = true
    toggle.dispatchEvent(new Event('change'))

    // Wait a tick for the async handler
    await new Promise(r => setTimeout(r, 0))

    expect(chrome.storage.local.set).toHaveBeenCalledWith(
      expect.objectContaining({ displayMode: 'substitution' })
    )
  })
})
