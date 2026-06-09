import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import React from 'react'
import { useParseWebpage } from '../api/webparserApi'

vi.mock('../../../shared/api/httpClient', () => ({
  httpClient: vi.fn(),
  ApiError: class ApiError extends Error {
    constructor(public status: number, message: string) { super(message) }
  },
}))

import { httpClient } from '../../../shared/api/httpClient'
const mockHttpClient = vi.mocked(httpClient)

function makeWrapper() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: qc }, children)
}

const MOCK_RESULT = {
  html: '<p>1. e4 e5</p>',
  games: [
    {
      charStart: 3,
      charEnd: 13,
      source: '1. e4 e5',
      tree: {
        startFen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
        nodes: {},
        mainline: [],
        variations: {},
      },
    },
  ],
  images: [{ src: 'diagram.jpg', alt: 'diagram' }],
}

describe('useParseWebpage', () => {
  beforeEach(() => { mockHttpClient.mockReset() })
  afterEach(() => { vi.clearAllMocks() })

  it('calls POST /api/webparser/parse with the url', async () => {
    mockHttpClient.mockResolvedValueOnce(MOCK_RESULT)
    const { result } = renderHook(() => useParseWebpage(), { wrapper: makeWrapper() })

    result.current.mutate('https://example.com/chess')

    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(mockHttpClient).toHaveBeenCalledWith('/api/webparser/parse', {
      method: 'POST',
      body: JSON.stringify({ url: 'https://example.com/chess' }),
    })
  })

  it('returns html, games, and images on success', async () => {
    mockHttpClient.mockResolvedValueOnce(MOCK_RESULT)
    const { result } = renderHook(() => useParseWebpage(), { wrapper: makeWrapper() })

    result.current.mutate('https://example.com/chess')

    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(result.current.data?.html).toBe(MOCK_RESULT.html)
    expect(result.current.data?.games).toHaveLength(1)
    expect(result.current.data?.images).toHaveLength(1)
    expect(result.current.data?.images[0].src).toBe('diagram.jpg')
  })

  it('surfaces error on failure', async () => {
    mockHttpClient.mockRejectedValueOnce(new Error('Network error'))
    const { result } = renderHook(() => useParseWebpage(), { wrapper: makeWrapper() })

    result.current.mutate('https://example.com/chess')

    await waitFor(() => expect(result.current.isError).toBe(true))
    expect(result.current.error?.message).toBe('Network error')
  })
})
