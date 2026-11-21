import { describe, it, expect, beforeEach } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { TextZoom } from '../TextZoom'

describe('TextZoom control', () => {
  beforeEach(() => localStorage.clear())

  it('zooms in, out and resets, showing the percentage', () => {
    const calls: string[] = []
    render(<TextZoom zoom={110} onZoomIn={() => calls.push('in')} onZoomOut={() => calls.push('out')} onReset={() => calls.push('reset')} />)
    expect(screen.getByRole('button', { name: 'Reset text zoom' }).textContent).toBe('110%')
    fireEvent.click(screen.getByRole('button', { name: 'Zoom text in' }))
    fireEvent.click(screen.getByRole('button', { name: 'Zoom text out' }))
    fireEvent.click(screen.getByRole('button', { name: 'Reset text zoom' }))
    expect(calls).toEqual(['in', 'out', 'reset'])
  })

  it('disables the buttons at the limits', () => {
    const noop = () => {}
    const { rerender } = render(<TextZoom zoom={60} onZoomIn={noop} onZoomOut={noop} onReset={noop} />)
    expect((screen.getByRole('button', { name: 'Zoom text out' }) as HTMLButtonElement).disabled).toBe(true)
    rerender(<TextZoom zoom={200} onZoomIn={noop} onZoomOut={noop} onReset={noop} />)
    expect((screen.getByRole('button', { name: 'Zoom text in' }) as HTMLButtonElement).disabled).toBe(true)
  })
})
