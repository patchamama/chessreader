import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { isVisited, markVisited, resetVisited, useVisited, VISITED_STORAGE_KEY } from './visitedStore'

describe('visited store (S9: what was already opened)', () => {
  beforeEach(() => {
    try { localStorage.clear() } catch { /* no storage */ }
    // Each test starts from an empty store.
    resetVisited()
  })
  afterEach(() => vi.restoreAllMocks())

  it('records an opened game, server book and resources book, each by its own kind', () => {
    expect(isVisited('game', 'k3-1')).toBe(false)
    markVisited('game', 'k3-1')
    markVisited('serverBook', 7)
    markVisited('repoBook', 'k3')
    expect(isVisited('game', 'k3-1')).toBe(true)
    expect(isVisited('serverBook', 7)).toBe(true)
    expect(isVisited('repoBook', 'k3')).toBe(true)
    // Same id, other kind: not opened.
    expect(isVisited('repoBook', 'k3-1')).toBe(false)
    expect(isVisited('serverBook', 8)).toBe(false)
  })

  it('is kept in the browser (localStorage) so a refresh still shows it', () => {
    markVisited('game', 'k3-2')
    expect(localStorage.getItem(VISITED_STORAGE_KEY)).toContain('game:k3-2')
  })

  it('a blocked storage only means nothing is kept: marking and reading still work', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('QuotaExceeded') })
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('SecurityError') })
    expect(() => markVisited('game', 'x')).not.toThrow()
    expect(isVisited('game', 'x')).toBe(true)
  })

  it('useVisited re-renders when the item is opened', () => {
    const { result } = renderHook(() => useVisited('repoBook', 'k3'))
    expect(result.current).toBe(false)
    act(() => markVisited('repoBook', 'k3'))
    expect(result.current).toBe(true)
  })
})
