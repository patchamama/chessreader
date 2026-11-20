import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'

vi.mock('../api/serverSession', () => ({ hasServerSession: () => false }))

import { useLlm, configuredLlm } from './useLlm'
import { useSettingsStore } from '../settings/settingsStore'

beforeEach(() => {
  useSettingsStore.getState().reset()
  vi.unstubAllGlobals()
})

describe('useLlm', () => {
  it('is unavailable while the assistant is off', () => {
    const { result } = renderHook(() => useLlm())
    expect(result.current.available).toBe(false)
    expect(result.current.vision).toBe(false)
    expect(result.current.config).toBeNull()
    expect(configuredLlm()).toBeNull()
  })

  it('Anthropic needs only a key (its model has a default) and can see unless a test said otherwise', () => {
    const { result } = renderHook(() => useLlm())
    act(() => useSettingsStore.getState().set({ aiProvider: 'anthropic', aiBaseUrl: 'https://api.anthropic.com' }))
    expect(result.current.available).toBe(false)
    act(() => useSettingsStore.getState().set({ aiKey: 'sk-ant' }))
    expect(result.current.available).toBe(true)
    expect(result.current.vision).toBe(true)
    expect(result.current.config).toEqual({ provider: 'anthropic', baseUrl: 'https://api.anthropic.com', apiKey: 'sk-ant', model: '' })
    act(() => useSettingsStore.getState().set({ aiVision: false }))
    expect(result.current.vision).toBe(false)
  })

  it('Ollama needs a base URL and a model but no key; vision comes from the last Test', () => {
    const { result } = renderHook(() => useLlm())
    act(() => useSettingsStore.getState().set({ aiProvider: 'ollama', aiBaseUrl: 'http://localhost:11434/v1' }))
    expect(result.current.available).toBe(false)
    act(() => useSettingsStore.getState().set({ aiModel: 'llava' }))
    expect(result.current.available).toBe(true)
    expect(result.current.vision).toBe(false)
    act(() => useSettingsStore.getState().set({ aiVision: true }))
    expect(result.current.vision).toBe(true)
  })

  it('OpenAI needs a key and a model', () => {
    useSettingsStore.getState().set({ aiProvider: 'openai', aiBaseUrl: 'https://api.openai.com/v1', aiModel: 'gpt-x' })
    expect(configuredLlm()).toBeNull()
    useSettingsStore.getState().set({ aiKey: 'sk' })
    expect(configuredLlm()).toMatchObject({ provider: 'openai', model: 'gpt-x' })
  })

  it('complete calls the configured model', async () => {
    useSettingsStore.getState().set({ aiProvider: 'ollama', aiBaseUrl: 'http://localhost:11434/v1', aiModel: 'llava' })
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ choices: [{ message: { content: 'hi' } }] }), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)
    const { result } = renderHook(() => useLlm())
    expect((await result.current.complete({ messages: [{ role: 'user', text: 'x' }] })).text).toBe('hi')
    expect(fetchMock).toHaveBeenCalledWith('http://localhost:11434/v1/chat/completions', expect.anything())
  })
})
