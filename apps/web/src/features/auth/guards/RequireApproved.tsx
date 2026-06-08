import React from 'react'
import { Navigate } from 'react-router-dom'
import { useAuthStore } from '../store/authStore'

interface Props {
  children: React.ReactNode
}

export default function RequireApproved({ children }: Props) {
  const { token, user } = useAuthStore()

  if (!token || !user) return <Navigate to="/login" replace />
  if (user.status !== 'approved') return <Navigate to="/pending" replace />

  return <>{children}</>
}
