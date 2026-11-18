import React from 'react'
import { Navigate } from 'react-router-dom'
import { useAuthStore } from '../store/authStore'
import { isDemoHost, isLocalhostHost } from '../../../shared/env/devMode'

interface Props {
  children: React.ReactNode
}

export default function RequireApproved({ children }: Props) {
  const { token, user } = useAuthStore()

  if (!token || !user) {
    // Login is optional on localhost (the dev API accepts tokenless requests)
    // and in the demo (its mock API needs no account): the examples show at once.
    if (isLocalhostHost() || isDemoHost()) return <>{children}</>
    return <Navigate to="/login" replace />
  }
  if (user.status !== 'approved') return <Navigate to="/pending" replace />

  return <>{children}</>
}
