import { describe, it, expect, beforeEach, vi } from 'vitest'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { useEffect, useState } from 'react'
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom'
import AppLayout from '../AppLayout'
import { KEEP_ALIVE_TABS } from '../keepAlive'
import { useAuthStore } from '../../features/auth/store/authStore'
import { useStatusStore } from '../../shared/layout/statusStore'
import { useSettingsStore } from '../../shared/settings/settingsStore'

vi.mock('../../shared/env/devMode', () => ({ isLocalhostHost: vi.fn(() => false) }))

let searchMounts = 0

function SearchPage() {
  const [q, setQ] = useState('')
  const { pathname } = useLocation()
  useEffect(() => { searchMounts++ }, [])
  return (
    <div>
      <input aria-label="Search games" value={q} onChange={(e) => setQ(e.target.value)} />
      <p data-testid="search-path">{pathname}</p>
    </div>
  )
}

function renderApp(path = '/search') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route element={<AppLayout />}>
          <Route path="/search" element={<SearchPage />} />
          <Route path="/play" element={<p>Play page</p>} />
          <Route path="/read/:bookId" element={<p>Reader page</p>} />
        </Route>
      </Routes>
    </MemoryRouter>,
  )
}

const nav = (name: string) => fireEvent.click(screen.getByRole('link', { name }))

describe('the main tabs keep their content when you leave and come back (S8)', () => {
  beforeEach(() => {
    searchMounts = 0
    useAuthStore.setState({ token: null, user: null })
    useStatusStore.setState({ items: [] })
    useSettingsStore.setState({ statusFooter: true })
  })

  it('keeps what was typed in Game search after visiting Play, without remounting the page', () => {
    renderApp()
    fireEvent.change(screen.getByRole('textbox', { name: 'Search games' }), { target: { value: 'Kasparov' } })
    nav('Play')
    expect(screen.getByText('Play page')).toBeVisible()
    nav('Game search')
    expect(screen.getByRole('textbox', { name: 'Search games' })).toHaveValue('Kasparov')
    expect(searchMounts).toBe(1)
  })

  it('hides the tab that is not shown and keeps its own location while hidden', () => {
    renderApp()
    nav('Play')
    expect(screen.getByRole('textbox', { name: 'Search games', hidden: true })).not.toBeVisible()
    expect(screen.getByTestId('search-path')).toHaveTextContent('/search')
    nav('Game search')
    expect(screen.queryByText('Play page')).not.toBeVisible()
  })

  it('does not keep the reader alive: it unmounts when you leave it', () => {
    renderApp('/read/3')
    expect(screen.getByText('Reader page')).toBeInTheDocument()
    nav('Game search')
    expect(screen.queryByText('Reader page')).toBeNull()
  })

  it('a hidden tab does not overwrite the status bar of the page shown', () => {
    renderApp('/play')
    act(() => useStatusStore.getState().setStatus('play.time', 'Time', '00:05'))
    expect(screen.getByTestId('status-footer')).toHaveTextContent('00:05')
    nav('Game search')
    act(() => useStatusStore.getState().setStatus('play.time', 'Time', '00:06'))
    expect(screen.getByTestId('status-footer')).not.toHaveTextContent('00:06')
    nav('Play')
    expect(screen.getByTestId('status-footer')).toHaveTextContent('00:06')
  })

  it('restores the window scroll of each tab when you come back to it', () => {
    const scrollTo = vi.fn((_x: number, y: number) => { Object.defineProperty(window, 'scrollY', { value: y, configurable: true }) })
    vi.stubGlobal('scrollTo', scrollTo)
    renderApp()
    Object.defineProperty(window, 'scrollY', { value: 640, configurable: true })
    fireEvent.scroll(window)
    nav('Play')
    expect(scrollTo).toHaveBeenLastCalledWith(0, 0)
    nav('Game search')
    expect(scrollTo).toHaveBeenLastCalledWith(0, 640)
    vi.unstubAllGlobals()
    Object.defineProperty(window, 'scrollY', { value: 0, configurable: true })
  })

  it('forgets the kept tabs when the session changes (logout / another user)', () => {
    renderApp()
    fireEvent.change(screen.getByRole('textbox', { name: 'Search games' }), { target: { value: 'Tal' } })
    nav('Play')
    act(() => useAuthStore.setState({ token: 'tok', user: { email: 'a@b.com', role: 'user', status: 'approved' } }))
    nav('Game search')
    expect(screen.getByRole('textbox', { name: 'Search games' })).toHaveValue('')
  })
})

describe('the analysis board tab is kept alive (S11)', () => {
  it('lists analysis among the kept tabs', () => {
    expect(KEEP_ALIVE_TABS).toContain('analysis')
  })
})
