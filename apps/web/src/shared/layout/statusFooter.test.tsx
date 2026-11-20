import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { StatusFooter } from './StatusFooter'
import { useStatusStore } from './statusStore'
import { useSettingsStore } from '../settings/settingsStore'
import { pageWidthClass } from './pageWidth'

beforeEach(() => { useSettingsStore.getState().reset(); useStatusStore.setState({ items: [] }) })

describe('status footer (S5)', () => {
  it('lists what the page publishes, in order, and can be hidden', () => {
    render(<StatusFooter />)
    act(() => {
      useStatusStore.getState().setStatus('reader.move', 'Move', '12... Nxe4')
      useStatusStore.getState().setStatus('reader.eval', 'Eval', '+0.8 (d16)')
      useStatusStore.getState().setStatus('reader.move', 'Move', '13. Bxe4')
    })
    expect(screen.getByTestId('status-footer')).toHaveTextContent('Move: 13. Bxe4Eval: +0.8 (d16)')
    act(() => useStatusStore.getState().clearStatus('reader.'))
    expect(screen.getByTestId('status-footer')).not.toHaveTextContent('Move')
    fireEvent.click(screen.getByRole('button', { name: 'Hide the status bar' }))
    expect(useSettingsStore.getState().statusFooter).toBe(false)
  })
})

describe('page width (S5)', () => {
  it('normal, wide or the whole window on desktop', () => {
    expect(pageWidthClass('normal')).toBe('max-w-6xl')
    expect(pageWidthClass('wide')).toBe('max-w-screen-2xl')
    expect(pageWidthClass('full')).toBe('max-w-none')
  })
})

describe('status footer GPU models', () => {
  it('shows the models Ollama has loaded, and nothing when none', async () => {
    vi.useFakeTimers()
    try {
      useSettingsStore.getState().set({ aiProvider: 'ollama', aiBaseUrl: 'http://localhost:11434/v1' })
      const body = { models: [{ name: 'gpt-oss:20b', size: 12.7e9, size_vram: 12.7e9, expires_at: '2318-01-01T00:00:00Z' }] }
      vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => body }) as Response))
      render(<StatusFooter />)
      await act(async () => { await vi.advanceTimersByTimeAsync(0) })
      const chip = screen.getByTestId('footer-gpu-models')
      expect(chip).toHaveTextContent('GPU · gpt-oss:20b · 12.7 GB')
      expect(chip.querySelector('[title]')).toHaveAttribute('title', expect.stringContaining('Stays loaded'))
    } finally { vi.useRealTimers(); vi.unstubAllGlobals() }
  })

  it('renders nothing for no loaded model', async () => {
    vi.useFakeTimers()
    try {
      useSettingsStore.getState().set({ aiProvider: 'ollama', aiBaseUrl: 'http://localhost:11434/v1' })
      vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ models: [] }) }) as Response))
      render(<StatusFooter />)
      await act(async () => { await vi.advanceTimersByTimeAsync(0) })
      expect(screen.queryByTestId('footer-gpu-models')).toBeNull()
    } finally { vi.useRealTimers(); vi.unstubAllGlobals() }
  })
})
