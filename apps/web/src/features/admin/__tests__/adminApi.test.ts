import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import React from 'react'

vi.mock('../../../shared/api/httpClient', () => ({
  httpClient: vi.fn(),
  ApiError: class ApiError extends Error {
    constructor(public status: number, msg: string) { super(msg) }
  },
}))

import { httpClient } from '../../../shared/api/httpClient'
import { usePendingUsers, useApproveUser, useRejectUser } from '../api/adminApi'

const mockHttp = vi.mocked(httpClient)

function wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  return React.createElement(QueryClientProvider, { client: qc }, children)
}

describe('adminApi', () => {
  beforeEach(() => vi.resetAllMocks())

  it('usePendingUsers calls GET /api/admin/pending-users', async () => {
    mockHttp.mockResolvedValue([])
    renderHook(() => usePendingUsers(), { wrapper })
    await act(async () => {})
    expect(mockHttp).toHaveBeenCalledWith('/api/admin/pending-users', expect.objectContaining({ method: 'GET' }))
  })

  it('useApproveUser calls POST /api/admin/users/:id/approve', async () => {
    mockHttp.mockResolvedValue({ ok: true })
    const { result } = renderHook(() => useApproveUser(), { wrapper })
    await act(async () => { await result.current.mutateAsync(5) })
    expect(mockHttp).toHaveBeenCalledWith('/api/admin/users/5/approve', expect.objectContaining({ method: 'POST' }))
  })

  it('useRejectUser calls POST /api/admin/users/:id/reject', async () => {
    mockHttp.mockResolvedValue({ ok: true })
    const { result } = renderHook(() => useRejectUser(), { wrapper })
    await act(async () => { await result.current.mutateAsync(3) })
    expect(mockHttp).toHaveBeenCalledWith('/api/admin/users/3/reject', expect.objectContaining({ method: 'POST' }))
  })
})
