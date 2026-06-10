import { describe, it, expect, vi, beforeEach } from 'vitest'

// We test httpClient in isolation by mocking fetch and authStore
vi.mock('../../../features/auth/store/authStore', () => ({
  useAuthStore: {
    getState: vi.fn(() => ({ token: null })),
  },
}))

import { httpClient, ApiError } from '../httpClient'
import { useAuthStore } from '../../../features/auth/store/authStore'

const mockGetState = vi.mocked(useAuthStore.getState)

describe('httpClient', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    mockGetState.mockReturnValue({ token: null } as unknown as ReturnType<typeof useAuthStore.getState>)
  })

  it('includes Authorization header when token is present', async () => {
    mockGetState.mockReturnValue({ token: 'my.jwt.token' } as unknown as ReturnType<typeof useAuthStore.getState>)

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ data: 1 }),
    })

    await httpClient('/api/test', { method: 'GET' })

    expect(globalThis.fetch).toHaveBeenCalledWith(
      '/api/test',
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: 'Bearer my.jwt.token',
        }),
      })
    )
  })

  it('does not include Authorization header when token is null', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({}),
    })

    await httpClient('/api/test', { method: 'GET' })

    const calledHeaders = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0][1].headers
    expect(calledHeaders?.Authorization).toBeUndefined()
  })

  it('throws ApiError on non-2xx response', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 409,
      json: () => Promise.resolve({ error: 'Email already registered' }),
    })

    await expect(httpClient('/api/auth/register', { method: 'POST' })).rejects.toBeInstanceOf(ApiError)
  })

  it('ApiError carries status and message', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      json: () => Promise.resolve({ error: 'Unauthorized' }),
    })

    try {
      await httpClient('/api/auth/login', { method: 'POST' })
    } catch (e) {
      expect(e).toBeInstanceOf(ApiError)
      expect((e as ApiError).status).toBe(401)
      expect((e as ApiError).message).toBe('Unauthorized')
    }
  })

  it('parses JSON on success', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ token: 'abc' }),
    })

    const result = await httpClient('/api/auth/login', { method: 'POST' })
    expect(result).toEqual({ token: 'abc' })
  })
})
