import { beforeEach, describe, expect, it } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { NotationToggle } from '../NotationToggle'
import { useSettingsStore } from '../../settings/settingsStore'

beforeEach(() => useSettingsStore.setState({ language: 'es', notationStyle: 'letters' }))

describe('NotationToggle (S12)', () => {
  it('shows what a click switches to and flips the shared setting', () => {
    render(<NotationToggle />)
    const toFigurines = screen.getByRole('button', { name: 'Show pieces as figurines' })
    expect(toFigurines).toHaveTextContent('♞')
    fireEvent.click(toFigurines)
    expect(useSettingsStore.getState().notationStyle).toBe('figurine')
    // In Spanish the knight letter is C.
    expect(screen.getByRole('button', { name: 'Show pieces as letters' })).toHaveTextContent('C')
  })
})
