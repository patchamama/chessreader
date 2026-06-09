import { describe, it, expect, vi } from 'vitest'
import { initOptions } from '../options/Options'

function makeOptionsDoc(): Document {
  const doc = document.implementation.createHTMLDocument()
  doc.body.innerHTML = `
    <input id="api-base-url" type="text">
    <input id="auth-token" type="text">
    <button id="save-btn">Save</button>
  `
  return doc
}

describe('Options', () => {
  it('loads stored values into the inputs', async () => {
    vi.mocked(chrome.storage.local.get).mockImplementation(
      (_keys: unknown, cb?: (items: Record<string, unknown>) => void) => {
        const r = { apiBaseUrl: 'https://my-api.example.com', authToken: 'my-token' }
        if (cb) cb(r)
        return Promise.resolve(r) as unknown as void
      }
    )

    const doc = makeOptionsDoc()
    await initOptions(doc)

    const baseUrl = doc.getElementById('api-base-url') as HTMLInputElement
    const token = doc.getElementById('auth-token') as HTMLInputElement
    expect(baseUrl.value).toBe('https://my-api.example.com')
    expect(token.value).toBe('my-token')
  })

  it('saves new values to chrome.storage on save button click', async () => {
    vi.mocked(chrome.storage.local.get).mockImplementation(
      (_keys: unknown, cb?: (items: Record<string, unknown>) => void) => {
        const r = {}
        if (cb) cb(r)
        return Promise.resolve(r) as unknown as void
      }
    )

    const doc = makeOptionsDoc()
    await initOptions(doc)

    const baseUrl = doc.getElementById('api-base-url') as HTMLInputElement
    const token = doc.getElementById('auth-token') as HTMLInputElement
    baseUrl.value = 'https://new-api.example.com'
    token.value = 'new-token'

    doc.getElementById('save-btn')?.click()

    await new Promise(r => setTimeout(r, 0))

    expect(chrome.storage.local.set).toHaveBeenCalledWith({
      apiBaseUrl: 'https://new-api.example.com',
      authToken: 'new-token',
    })
  })
})
