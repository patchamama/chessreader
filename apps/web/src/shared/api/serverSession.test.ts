import { afterEach, describe, expect, it, vi } from 'vitest'
import * as dev from '../env/devMode'
import { useAuthStore } from '../../features/auth/store/authStore'
import { hasServerSession } from './serverSession'

describe('talking to the server (resources, comments, traps)', () => {
  afterEach(() => { vi.restoreAllMocks(); useAuthStore.setState({ token: null, user: null }) })

  it('on localhost the server answers without logging in (login is optional there)', () => {
    vi.spyOn(dev, 'isDemoHost').mockReturnValue(false)
    vi.spyOn(dev, 'isLocalhostHost').mockReturnValue(true)
    expect(hasServerSession()).toBe(true)
  })

  it('elsewhere it needs a session, and the demo never has a server', () => {
    vi.spyOn(dev, 'isLocalhostHost').mockReturnValue(false)
    const demo = vi.spyOn(dev, 'isDemoHost').mockReturnValue(false)
    expect(hasServerSession()).toBe(false)
    useAuthStore.setState({ token: 't' })
    expect(hasServerSession()).toBe(true)
    demo.mockReturnValue(true)
    expect(hasServerSession()).toBe(false)
  })
})
