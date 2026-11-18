import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import SettingsPanel from './SettingsPanel'
import { useSettingsStore } from './settingsStore'

beforeEach(() => useSettingsStore.getState().reset())

describe('SettingsPanel study options', () => {
  it('chooses the language of commentary and narration', () => {
    render(<SettingsPanel onClose={() => {}} />)
    fireEvent.change(screen.getByLabelText('Language (commentary and narration)'), { target: { value: 'de' } })
    expect(useSettingsStore.getState().language).toBe('de')
  })

  it('sets the seconds before an unanswered move is announced again', () => {
    render(<SettingsPanel onClose={() => {}} />)
    expect(useSettingsStore.getState().narrationRepeatSeconds).toBe(5)
    fireEvent.click(screen.getByLabelText('Increase repeat delay'))
    expect(useSettingsStore.getState().narrationRepeatSeconds).toBe(6)
  })

  it('no longer offers where a square named in the text is shown (always a hover thumbnail now)', () => {
    render(<SettingsPanel onClose={() => {}} />)
    expect(screen.queryByRole('button', { name: 'Hover thumbnail' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Main board' })).toBeNull()
    expect('mentionPreview' in useSettingsStore.getState()).toBe(false)
  })

  it('can be maximised and restored', () => {
    render(<SettingsPanel onClose={() => {}} />)
    const panel = screen.getByTestId('settings-panel')
    expect(panel.className).toContain('w-80')
    fireEvent.click(screen.getByRole('button', { name: 'Maximise settings' }))
    expect(panel.className).toContain('w-full')
    fireEvent.click(screen.getByRole('button', { name: 'Restore settings size' }))
    expect(panel.className).toContain('w-80')
  })
})
