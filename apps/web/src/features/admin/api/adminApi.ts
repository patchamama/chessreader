import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { httpClient } from '../../../shared/api/httpClient'

export interface PendingUser {
  id: number
  email: string
  status: string
}

export function usePendingUsers() {
  return useQuery<PendingUser[]>({
    queryKey: ['pending-users'],
    queryFn: () => httpClient<PendingUser[]>('/api/admin/pending-users', { method: 'GET' }),
  })
}

export function useApproveUser() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (userId: number) =>
      httpClient(`/api/admin/users/${userId}/approve`, { method: 'POST' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['pending-users'] }),
  })
}

export function useRejectUser() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (userId: number) =>
      httpClient(`/api/admin/users/${userId}/reject`, { method: 'POST' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['pending-users'] }),
  })
}
