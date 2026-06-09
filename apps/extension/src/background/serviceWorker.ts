/**
 * serviceWorker.ts
 *
 * MV3 background service worker.
 * Handles 'parse' messages: calls the backend POST /api/webparser/parse
 * using the stored token + API base URL from chrome.storage.
 */

const STORAGE_KEYS = ['apiBaseUrl', 'authToken'] as const

export interface ParseMessage {
  type: 'parse'
  url: string
}

export interface ParseResult {
  html: string
  games: unknown[]
  images: unknown[]
}

export async function handleParseMessage(
  message: ParseMessage
): Promise<ParseResult> {
  const stored = await chrome.storage.local.get([...STORAGE_KEYS])
  const baseUrl = (stored['apiBaseUrl'] as string) ?? ''
  const token = (stored['authToken'] as string) ?? ''

  const endpoint = `${baseUrl}/api/webparser/parse`

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ url: message.url }),
  })

  if (!response.ok) {
    throw new Error(`API error: ${response.status}`)
  }

  return response.json() as Promise<ParseResult>
}

// Register message listener (only in real extension context)
if (typeof chrome !== 'undefined' && chrome.runtime?.onMessage) {
  chrome.runtime.onMessage.addListener(
    (
      message: unknown,
      _sender: chrome.runtime.MessageSender,
      sendResponse: (response?: unknown) => void
    ) => {
      if ((message as ParseMessage)?.type === 'parse') {
        handleParseMessage(message as ParseMessage)
          .then(sendResponse)
          .catch((err: Error) => sendResponse({ error: err.message }))
        return true // keep channel open for async response
      }
    }
  )
}
