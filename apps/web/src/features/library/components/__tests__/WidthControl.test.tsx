import { describe, expect, it } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { WidthControl } from '../WidthControl'
import { useSettingsStore } from '../../../../shared/settings/settingsStore'

describe('reading width beyond the page container', () => {
  it('a wide or full text column also widens the page, so the text can grow (not only shrink)', () => {
    useSettingsStore.setState({ pageWidth: 'normal' })
    render(<WidthControl />)
    fireEvent.click(screen.getByRole('button', { name: 'Reading width' }))
    fireEvent.click(screen.getByRole('button', { name: 'Full width' }))
    expect(useSettingsStore.getState().pageWidth).toBe('full')
  })
})
