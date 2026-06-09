import { describe, it, expect, vi, beforeEach } from 'vitest'
import { handleParseMessage } from '../background/serviceWorker'

describe('serviceWorker handleParseMessage', () => {
  beforeEach(() => {
    // Set up chrome.storage to return token + baseUrl
    vi.mocked(chrome.storage.local.get).mockImplementation(
      (_keys: unknown, callback?: (items: Record<string, unknown>) => void) => {
        const result = { apiBaseUrl: 'https://api.example.com', authToken: 'secret-token' }
        if (callback) callback(result)
        return Promise.resolve(result) as unknown as void
      }
    )
  })

  it('calls fetch with Authorization header and correct endpoint', async () => {
    const mockResult = { html: '<p>hi</p>', games: [], images: [] }
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockResult),
    } as unknown as Response)

    const result = await handleParseMessage({
      type: 'parse',
      url: 'https://example.com/chess-article',
    })

    expect(fetch).toHaveBeenCalledWith(
      'https://api.example.com/api/webparser/parse',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: 'Bearer secret-token',
        }),
      })
    )
    expect(result).toEqual(mockResult)
  })

  it('throws when API returns non-ok status', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
    } as unknown as Response)

    await expect(
      handleParseMessage({ type: 'parse', url: 'https://example.com' })
    ).rejects.toThrow('API error: 401')
  })
})
