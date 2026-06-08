import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import React from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import PendingUsersTable from '../components/PendingUsersTable'

vi.mock('../api/adminApi', () => ({
  usePendingUsers: vi.fn(),
  useApproveUser: vi.fn(),
  useRejectUser: vi.fn(),
}))

import { usePendingUsers, useApproveUser, useRejectUser } from '../api/adminApi'
const mockUsePending = vi.mocked(usePendingUsers)
const mockUseApprove = vi.mocked(useApproveUser)
const mockUseReject = vi.mocked(useRejectUser)

function wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return React.createElement(QueryClientProvider, { client: qc }, children)
}

const pendingUsers = [
  { id: 1, email: 'a@b.com', status: 'pending' },
  { id: 2, email: 'c@d.com', status: 'pending' },
]

describe('PendingUsersTable', () => {
  const mutateAsync = vi.fn()

  beforeEach(() => {
    vi.resetAllMocks()
    mockUsePending.mockReturnValue({ data: pendingUsers, isLoading: false, error: null } as any)
    mockUseApprove.mockReturnValue({ mutateAsync, isPending: false } as any)
    mockUseReject.mockReturnValue({ mutateAsync, isPending: false } as any)
  })

  it('renders one row per pending user', () => {
    render(<PendingUsersTable />, { wrapper })
    expect(screen.getByText('a@b.com')).toBeInTheDocument()
    expect(screen.getByText('c@d.com')).toBeInTheDocument()
  })

  it('calls approveUser mutation on Approve click', () => {
    render(<PendingUsersTable />, { wrapper })
    const approveButtons = screen.getAllByRole('button', { name: /approve/i })
    fireEvent.click(approveButtons[0])
    expect(mutateAsync).toHaveBeenCalledWith(1)
  })

  it('calls rejectUser mutation on Reject click', () => {
    render(<PendingUsersTable />, { wrapper })
    const rejectButtons = screen.getAllByRole('button', { name: /reject/i })
    fireEvent.click(rejectButtons[0])
    expect(mutateAsync).toHaveBeenCalledWith(1)
  })
})
