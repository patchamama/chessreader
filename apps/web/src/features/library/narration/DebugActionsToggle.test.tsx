import { beforeEach, describe, expect, it } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { DebugActionsToggle } from './DebugActionsToggle'
import { useSettingsStore } from '../../../shared/settings/settingsStore'

beforeEach(() => useSettingsStore.getState().set({ debugActions: false }))

describe('the guides toggle of the reader toolbar (ai-narration-guides S1)', () => {
  it('shows and hides the guides of the whole document, and says which it will do', () => {
    render(<DebugActionsToggle />)
    const button = screen.getByRole('button', { name: 'Show narration guides' })
    expect(button).toHaveAttribute('aria-pressed', 'false')
    fireEvent.click(button)
    expect(useSettingsStore.getState().debugActions).toBe(true)
    expect(screen.getByRole('button', { name: 'Hide narration guides' })).toHaveAttribute('aria-pressed', 'true')
    fireEvent.click(screen.getByRole('button', { name: 'Hide narration guides' }))
    expect(useSettingsStore.getState().debugActions).toBe(false)
  })
})
