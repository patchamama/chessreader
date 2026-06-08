import { describe, it, expect, beforeEach } from 'vitest'
import { useAuthStore } from '../store/authStore'

describe('authStore', () => {
  beforeEach(() => {
    useAuthStore.setState({ token: null, user: null })
  })

  it('initial state has null token and user', () => {
    const { token, user } = useAuthStore.getState()
    expect(token).toBeNull()
    expect(user).toBeNull()
  })

  it('setSession persists token and user', () => {
    useAuthStore.getState().setSession('tok123', {
      email: 'alice@test.com',
      role: 'user',
      status: 'approved',
    })

    const { token, user } = useAuthStore.getState()
    expect(token).toBe('tok123')
    expect(user?.email).toBe('alice@test.com')
    expect(user?.role).toBe('user')
  })

  it('clear resets state', () => {
    useAuthStore.getState().setSession('tok123', { email: 'a@b.com', role: 'user', status: 'approved' })
    useAuthStore.getState().clear()

    const { token, user } = useAuthStore.getState()
    expect(token).toBeNull()
    expect(user).toBeNull()
  })
})
