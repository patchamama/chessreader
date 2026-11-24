import { describe, it, expect, beforeEach, vi } from 'vitest'
import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import AppLayout from '../AppLayout'
import { APP_VERSION } from '../../version'
import { useAuthStore } from '../../features/auth/store/authStore'
import { isLocalhostHost } from '../../shared/env/devMode'
import { useSettingsStore } from '../../shared/settings/settingsStore'
import { FOOTER_HEIGHT } from '../../shared/layout/StatusFooter'
import { openBookTab, useReaderTabs } from '../../features/library/analysis/readerTabs'
import { openAnalysisBoard, useAnalysisBoards } from '../../features/library/analysis/analysisBoards'

vi.mock('../../shared/env/devMode', () => ({
  isLocalhostHost: vi.fn(() => false),
  isDevMode: vi.fn(() => false),
}))

function renderLayout() {
  return render(
    <MemoryRouter initialEntries={['/library']}>
      <Routes>
        <Route element={<AppLayout />}>
          <Route path="/library" element={<div>Page Content</div>} />
        </Route>
      </Routes>
    </MemoryRouter>,
  )
}

describe('AppLayout', () => {
  beforeEach(() => {
    useAuthStore.setState({ token: null, user: null })
    vi.mocked(isLocalhostHost).mockReturnValue(false)
  })

  it('renders the banner with the app version', () => {
    renderLayout()
    expect(screen.getByTestId('banner')).toBeInTheDocument()
    expect(screen.getByText(`v${APP_VERSION}`)).toBeInTheDocument()
  })

  it('renders the routed page content via Outlet', () => {
    renderLayout()
    expect(screen.getByText('Page Content')).toBeInTheDocument()
  })

  it('shows dev mode badge and Admin link on localhost without session', () => {
    vi.mocked(isLocalhostHost).mockReturnValue(true)
    renderLayout()
    expect(screen.getByText('dev mode')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Admin' })).toBeInTheDocument()
  })

  it('hides Admin link for non-admin logged-in user', () => {
    useAuthStore.setState({
      token: 'tok',
      user: { email: 'a@b.com', role: 'user', status: 'approved' },
    })
    renderLayout()
    expect(
      screen.queryByRole('link', { name: 'Admin' }),
    ).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Logout' })).toBeInTheDocument()
  })
})

describe('AppLayout fits the reader to the window (S4)', () => {
  const renderAt = (path: string) => render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route element={<AppLayout />}>
          <Route path="/read/:bookId" element={<div data-testid="reader">reader</div>} />
          <Route path="/library" element={<div>Page Content</div>} />
          <Route path="/analysis" element={<div data-testid="analysis">analysis</div>} />
        </Route>
      </Routes>
    </MemoryRouter>,
  )

  beforeEach(() => {
    useAuthStore.setState({ token: null, user: null })
    useSettingsStore.setState({ statusFooter: true })
    useReaderTabs.setState({ books: [], selected: { type: 'current' } })
  })

  it('the Analysis board page fits the window too while a book is open in it (S10)', () => {
    openBookTab(7)
    renderAt('/analysis')
    const root = screen.getByTestId('app-root')
    expect(root.dataset.layout).toBe('fit')
    expect(root.style.height).toBe('100dvh')
  })

  it('the Analysis board page keeps the page layout without a book shown', () => {
    renderAt('/analysis')
    expect(screen.getByTestId('app-root').dataset.layout).toBe('page')
  })

  it('the reader page takes exactly the window height, above the status footer, and scrolls inside', () => {
    renderAt('/read/7')
    const root = screen.getByTestId('app-root')
    expect(root.dataset.layout).toBe('fit')
    expect(root.style.height).toBe('100dvh')
    expect(root.style.paddingBottom).toBe(`${FOOTER_HEIGHT}px`)
    expect(root.className).toContain('overflow-hidden')
    const main = screen.getByRole('main')
    expect(main.className).toContain('flex-1')
    expect(main.className).toContain('min-h-0')
    expect(main.className).not.toContain('py-8')
    expect(main.contains(screen.getByTestId('reader'))).toBe(true)
  })

  it('without the status footer the reader keeps the whole height', () => {
    useSettingsStore.setState({ statusFooter: false })
    renderAt('/read/7')
    expect(screen.getByTestId('app-root').style.paddingBottom).toBe('0px')
  })

  it('other pages keep growing with their content and the window scroll', () => {
    renderAt('/library')
    const root = screen.getByTestId('app-root')
    expect(root.dataset.layout).toBe('page')
    expect(root.style.height).toBe('')
    expect(root.className).toContain('min-h-screen')
  })
})

describe('AppLayout analysis board tab (S11)', () => {
  const renderAt = (path: string) => render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route element={<AppLayout />}>
          <Route path="/library" element={<div>Page Content</div>} />
          <Route path="/analysis" element={<div>Analysis page</div>} />
        </Route>
      </Routes>
    </MemoryRouter>,
  )

  beforeEach(() => {
    useAuthStore.setState({ token: null, user: null })
    useAnalysisBoards.setState({ boards: [], active: null })
  })

  it('shows "Analysis board" right after "Library" in the main navigation', () => {
    renderAt('/library')
    const links = within(screen.getByRole('navigation', { name: 'Main' })).getAllByRole('link').map((a) => a.textContent?.trim())
    expect(links.slice(0, 2)).toEqual(['Library', 'Analysis board'])
    expect(screen.getByRole('link', { name: 'Analysis board' })).toHaveAttribute('href', '/analysis')
  })

  it('hides the floating analysis boards on the analysis board tab, which shows them itself', () => {
    act(() => { openAnalysisBoard({ title: 'Line', startFen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1', moves: ['e4'] }) })
    renderAt('/library')
    expect(screen.getByRole('complementary', { name: 'Analysis boards' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('link', { name: 'Analysis board' }))
    expect(screen.getByText('Analysis page')).toBeVisible()
    expect(screen.queryByRole('complementary', { name: 'Analysis boards' })).toBeNull()
  })
})
