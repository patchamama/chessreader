import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { VoiceSettings } from './VoiceSettings'
import { useSettingsStore } from './settingsStore'

beforeEach(() => {
  useSettingsStore.getState().reset()
  useSettingsStore.setState({ language: 'es' })
  vi.unstubAllGlobals()
})

describe('VoiceSettings', () => {
  it('offers the browser, system, free and paid voices — and says why Anthropic is not there', () => {
    render(<VoiceSettings />)
    const options = [...screen.getByLabelText('Narration voice').querySelectorAll('option')].map((o) => o.value)
    expect(options).toEqual(['browser', 'system', 'piper', 'openai', 'elevenlabs'])
    expect(screen.getByText(/Anthropic offers no text-to-speech API/)).toBeInTheDocument()
  })

  it('a paid voice asks for its key, which stays in the settings', () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ providers: [] }), { status: 200 })))
    render(<VoiceSettings />)
    fireEvent.change(screen.getByLabelText('Narration voice'), { target: { value: 'elevenlabs' } })
    fireEvent.change(screen.getByLabelText(/API key/), { target: { value: 'xi-123' } })
    expect(useSettingsStore.getState().elevenlabsKey).toBe('xi-123')
    expect(useSettingsStore.getState().openaiKey).toBe('')
  })

  it('testing a server voice renders one sentence with the chosen voice and reports a failure', async () => {
    const bodies: unknown[] = []
    vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
      if (String(url).endsWith('/providers')) return new Response(JSON.stringify({ providers: [] }), { status: 200 })
      bodies.push(JSON.parse(String(init!.body)))
      return new Response(JSON.stringify({ error: 'An API key is required for openai' }), { status: 502 })
    }))
    useSettingsStore.setState({ voiceProvider: 'openai', voiceName: 'nova' })
    render(<VoiceSettings />)
    fireEvent.click(screen.getByRole('button', { name: 'Test voice' }))
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('An API key is required for openai'))
    expect(bodies[0]).toMatchObject({ segments: [expect.stringContaining('Caballo')], lang: 'es', voice: { provider: 'openai', voice: 'nova' } })
  })
})
