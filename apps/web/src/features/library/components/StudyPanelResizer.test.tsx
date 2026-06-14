import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { StudyPanelResizer } from './StudyPanelResizer'
import { useSettingsStore } from '../../../shared/settings/settingsStore'

// jsdom's PointerEvent doesn't carry clientX; build a plain Event and attach it
// so the component's handlers see the coordinate.
function pointer(type: string, clientX: number) {
  const ev = new Event(type, { bubbles: true, cancelable: true })
  Object.assign(ev, { clientX, pointerId: 1 })
  return ev
}

describe('StudyPanelResizer', () => {
  beforeEach(() => {
    useSettingsStore.getState().reset()
  })

  it('renders a separator with accessible role', () => {
    render(<StudyPanelResizer />)
    const handle = screen.getByRole('separator')
    expect(handle).toHaveAttribute('aria-orientation', 'vertical')
  })

  it('dragging left widens the panel (panel grows as pointer moves toward text)', () => {
    render(<StudyPanelResizer />)
    const handle = screen.getByRole('separator')
    const start = useSettingsStore.getState().studyPanelWidth

    fireEvent(handle, pointer('pointerdown', 800))
    fireEvent(handle, pointer('pointermove', 700)) // moved 100px left
    fireEvent(handle, pointer('pointerup', 700))

    expect(useSettingsStore.getState().studyPanelWidth).toBe(start + 100)
  })

  it('clamps width within [240, 900]', () => {
    render(<StudyPanelResizer />)
    const handle = screen.getByRole('separator')

    fireEvent(handle, pointer('pointerdown', 800))
    fireEvent(handle, pointer('pointermove', 100000)) // far right → tiny
    expect(useSettingsStore.getState().studyPanelWidth).toBe(240)

    fireEvent(handle, pointer('pointermove', -100000)) // far left → huge
    expect(useSettingsStore.getState().studyPanelWidth).toBe(900)
  })

  it('double-click resets to default width', () => {
    useSettingsStore.getState().set({ studyPanelWidth: 600 })
    render(<StudyPanelResizer />)
    const handle = screen.getByRole('separator')
    fireEvent.doubleClick(handle)
    expect(useSettingsStore.getState().studyPanelWidth).toBe(320)
  })

  it('does not change width on a plain click (no drag)', () => {
    render(<StudyPanelResizer />)
    const handle = screen.getByRole('separator')
    const start = useSettingsStore.getState().studyPanelWidth
    fireEvent(handle, pointer('pointerdown', 500))
    fireEvent(handle, pointer('pointerup', 500))
    expect(useSettingsStore.getState().studyPanelWidth).toBe(start)
    vi.restoreAllMocks()
  })
})
