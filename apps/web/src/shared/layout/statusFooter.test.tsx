import { beforeEach, describe, expect, it } from 'vitest'
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
