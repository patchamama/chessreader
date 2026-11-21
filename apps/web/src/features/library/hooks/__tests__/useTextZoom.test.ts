import { describe, it, expect, beforeEach } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { useTextZoom, ZOOM_KEY } from '../useTextZoom'

describe('useTextZoom', () => {
  beforeEach(() => localStorage.clear())

  it('starts at 100% and steps by 10 within 60-200', () => {
    const { result } = renderHook(() => useTextZoom())
    expect(result.current.zoom).toBe(100)
    act(() => result.current.zoomIn())
    expect(result.current.zoom).toBe(110)
    act(() => result.current.zoomOut())
    act(() => result.current.zoomOut())
    expect(result.current.zoom).toBe(90)
    for (let i = 0; i < 20; i++) act(() => result.current.zoomOut())
    expect(result.current.zoom).toBe(60)
    for (let i = 0; i < 30; i++) act(() => result.current.zoomIn())
    expect(result.current.zoom).toBe(200)
    act(() => result.current.reset())
    expect(result.current.zoom).toBe(100)
  })

  it('persists and restores, ignoring invalid stored values', () => {
    const a = renderHook(() => useTextZoom())
    act(() => a.result.current.zoomIn())
    expect(localStorage.getItem(ZOOM_KEY)).toBe('110')
    a.unmount()
    expect(renderHook(() => useTextZoom()).result.current.zoom).toBe(110)
    localStorage.setItem(ZOOM_KEY, '999')
    expect(renderHook(() => useTextZoom()).result.current.zoom).toBe(100)
  })
})
