import { beforeEach, describe, expect, it } from 'vitest'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { StatusFooter } from './StatusFooter'
import { useBusyStore, withBusy, withProgress } from './busyStore'
import { useSettingsStore } from '../settings/settingsStore'

beforeEach(() => { useSettingsStore.getState().reset(); useBusyStore.setState({ tasks: [] }) })

describe('progress of a long task in the status footer (S5)', () => {
  it('a task without progress shows its label and an indeterminate bar, gone when it ends or fails', async () => {
    render(<StatusFooter />)
    let finish!: () => void
    let run!: Promise<unknown>
    act(() => { run = withBusy('Opening the commented game…', () => new Promise<void>((r) => { finish = r })) })
    const bar = screen.getByRole('progressbar', { name: 'Opening the commented game…' })
    expect(bar).not.toHaveAttribute('aria-valuenow')
    expect(screen.getByTestId('status-footer')).toHaveTextContent('Opening the commented game…')
    await act(async () => { finish(); await run })
    expect(screen.queryByRole('progressbar')).toBeNull()
    await act(async () => { await withBusy('Failing…', () => Promise.reject(new Error('x'))).catch(() => {}) })
    expect(useBusyStore.getState().tasks).toEqual([])
  })

  it('a task reporting its progress shows the label, the bar and the percent', async () => {
    render(<StatusFooter />)
    let report!: (done: number, total: number) => void
    let finish!: () => void
    let run!: Promise<unknown>
    act(() => {
      run = withProgress('Commenting the game again', (r) => { report = r; return new Promise<void>((res) => { finish = res }) })
    })
    act(() => report(3, 12))
    const bar = screen.getByRole('progressbar', { name: 'Commenting the game again' })
    expect(bar).toHaveAttribute('aria-valuenow', '25')
    expect(screen.getByTestId('status-footer')).toHaveTextContent('25%')
    act(() => report(12, 12))
    expect(bar).toHaveAttribute('aria-valuenow', '100')
    await act(async () => { finish(); await run })
    expect(screen.queryByRole('progressbar')).toBeNull()
  })

  it('a collapsed footer still shows a thin bar while a task runs', async () => {
    useSettingsStore.getState().set({ statusFooter: false })
    render(<StatusFooter />)
    expect(screen.queryByRole('progressbar')).toBeNull()
    let report!: (done: number, total: number) => void
    let finish!: () => void
    let run!: Promise<unknown>
    act(() => { run = withProgress('Evaluating the book', (r) => { report = r; return new Promise<void>((res) => { finish = res }) }) })
    act(() => report(1, 4))
    expect(screen.getByRole('progressbar', { name: 'Evaluating the book' })).toHaveAttribute('aria-valuenow', '25')
    expect(screen.queryByTestId('status-footer')).toBeNull()
    await act(async () => { finish(); await run })
    expect(screen.queryByRole('progressbar')).toBeNull()
  })

  it('a cancellable task shows a Cancel button that aborts its signal', async () => {
    render(<StatusFooter />)
    let signal!: AbortSignal
    let run!: Promise<unknown>
    act(() => {
      run = withProgress('Evaluating the book', (_r, s) => {
        signal = s
        return new Promise<void>((_res, reject) => s.addEventListener('abort', () => reject(new Error('aborted'))))
      }, { cancellable: true })
    })
    fireEvent.click(screen.getByRole('button', { name: 'Cancel Evaluating the book' }))
    expect(signal.aborted).toBe(true)
    await act(async () => { await run.catch(() => {}) })
    expect(useBusyStore.getState().tasks).toEqual([])
  })
})
