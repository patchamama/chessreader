/**
 * Options.ts
 *
 * API base URL + auth token inputs, persisted to chrome.storage.
 */

export async function initOptions(doc: Document = document): Promise<void> {
  const stored = await chrome.storage.local.get(['apiBaseUrl', 'authToken'])

  const baseUrlInput = doc.getElementById('api-base-url') as HTMLInputElement | null
  const tokenInput = doc.getElementById('auth-token') as HTMLInputElement | null
  const saveBtn = doc.getElementById('save-btn')

  if (baseUrlInput) {
    baseUrlInput.value = (stored['apiBaseUrl'] as string) ?? ''
  }
  if (tokenInput) {
    tokenInput.value = (stored['authToken'] as string) ?? ''
  }

  saveBtn?.addEventListener('click', async () => {
    const apiBaseUrl = baseUrlInput?.value ?? ''
    const authToken = tokenInput?.value ?? ''
    await chrome.storage.local.set({ apiBaseUrl, authToken })
  })
}
