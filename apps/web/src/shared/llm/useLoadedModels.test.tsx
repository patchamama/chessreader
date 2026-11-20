import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { useLoadedModels } from './useLoadedModels'
import { useSettingsStore } from '../settings/settingsStore'

const ps = { models: [{ name: 'gpt-oss:20b', size: 12.7e9, size_vram: 12.7e9, expires_at: '2318-01-01T00:00:00Z' }] }
const ok = (body: unknown) => ({ ok: true, json: async () => body }) as Response
let fetchMock: ReturnType<typeof vi.fn>

beforeEach(() => {
  vi.useFakeTimers()
  useSettingsStore.getState().reset()
  useSettingsStore.getState().set({ aiProvider: 'ollama', aiBaseUrl: 'http://localhost:11434/v1' })
  fetchMock = vi.fn(async () => ok(ps))
  vi.stubGlobal('fetch', fetchMock)
})
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals() })

describe('useLoadedModels', () => {
  it('reads /api/ps of the Ollama root and polls every 10 s', async () => {
    const { result } = renderHook(() => useLoadedModels())
    await act(async () => { await vi.advanceTimersByTimeAsync(0) })
    expect(fetchMock.mock.calls[0][0]).toBe('http://localhost:11434/api/ps')
    expect(result.current.map((m) => m.name)).toEqual(['gpt-oss:20b'])
    await act(async () => { await vi.advanceTimersByTimeAsync(10_000) })
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('stops polling on unmount', async () => {
    const { unmount } = renderHook(() => useLoadedModels())
    await act(async () => { await vi.advanceTimersByTimeAsync(0) })
    unmount()
    await act(async () => { await vi.advanceTimersByTimeAsync(30_000) })
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('does nothing for another provider or without a URL', async () => {
    useSettingsStore.getState().set({ aiProvider: 'openai' })
    renderHook(() => useLoadedModels())
    await act(async () => { await vi.advanceTimersByTimeAsync(20_000) })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('skips polling while the page is hidden', async () => {
    const vis = vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden')
    renderHook(() => useLoadedModels())
    await act(async () => { await vi.advanceTimersByTimeAsync(20_000) })
    expect(fetchMock).not.toHaveBeenCalled()
    vis.mockRestore()
  })

  it('shows nothing when the request fails or the response is not ok', async () => {
    fetchMock.mockRejectedValue(new Error('CORS'))
    const { result } = renderHook(() => useLoadedModels())
    await act(async () => { await vi.advanceTimersByTimeAsync(0) })
    expect(result.current).toEqual([])
    fetchMock.mockResolvedValue({ ok: false, json: async () => ps } as Response)
    await act(async () => { await vi.advanceTimersByTimeAsync(10_000) })
    expect(result.current).toEqual([])
  })

  it('clears the list when a poll fails after a success', async () => {
    const { result } = renderHook(() => useLoadedModels())
    await act(async () => { await vi.advanceTimersByTimeAsync(0) })
    expect(result.current).toHaveLength(1)
    fetchMock.mockRejectedValue(new Error('offline'))
    await act(async () => { await vi.advanceTimersByTimeAsync(10_000) })
    expect(result.current).toEqual([])
  })
})
