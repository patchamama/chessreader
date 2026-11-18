import { describe, expect, it } from 'vitest'
import { act, render, screen } from '@testing-library/react'
import { BusyOverlay } from './BusyOverlay'
import { useBusyStore, withBusy } from './busyStore'

describe('spinner while a task runs (opening a commented game, a book…)', () => {
  it('shows a spinner with the task while it runs and hides it after, also when it fails', async () => {
    render(<BusyOverlay />)
    let finish!: () => void
    let run!: Promise<unknown>
    act(() => { run = withBusy('Opening the commented game…', () => new Promise<void>((r) => { finish = r })) })
    expect(screen.getByRole('status')).toHaveTextContent('Opening the commented game…')
    await act(async () => { finish(); await run })
    expect(screen.queryByRole('status')).toBeNull()
    await act(async () => { await withBusy('Failing…', () => Promise.reject(new Error('x'))).catch(() => {}) })
    expect(useBusyStore.getState().tasks).toEqual([])
  })
})
