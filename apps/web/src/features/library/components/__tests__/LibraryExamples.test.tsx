import { afterEach, describe, expect, it, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useSettingsStore } from '../../../../shared/settings/settingsStore'
import { useAuthStore } from '../../../auth/store/authStore'
import RequireApproved from '../../../auth/guards/RequireApproved'

vi.mock('../../../../shared/env/devMode', async (orig) => ({ ...(await orig<object>()), isDemoHost: () => true, isLocalhostHost: () => false }))

import LibraryGrid from '../LibraryGrid'
import SettingsPanel from '../../../../shared/settings/SettingsPanel'

const EXAMPLES = [
  { id: 1, title: 'Partidas inmortales comentadas', author: 'Demo', createdAt: '2026-11-16T10:00:00Z' },
  { id: 2, title: 'Annotated Classics', author: 'Demo', createdAt: '2026-11-16T10:00:00Z' },
]

function wrap(ui: React.ReactNode) {
  return render(<QueryClientProvider client={new QueryClient()}><MemoryRouter>{ui}</MemoryRouter></QueryClientProvider>)
}

describe('example books in the deployed app (S9)', () => {
  afterEach(() => { vi.unstubAllGlobals(); useSettingsStore.setState({ hiddenExamples: [], commentDbToken: '' }) })

  it('the library opens without logging in', () => {
    useAuthStore.setState({ token: null, user: null })
    wrap(<RequireApproved><p>library</p></RequireApproved>)
    expect(screen.getByText('library')).toBeInTheDocument()
  })

  it('every example is shown until its ✕ hides it, and Settings shows them all again', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => new Response(String(url).includes('/api/library/books') ? JSON.stringify(EXAMPLES) : '[]')))
    const { unmount } = wrap(<LibraryGrid />)
    expect(await screen.findByText('Annotated Classics')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Hide the example Annotated Classics' }))
    await waitFor(() => expect(screen.queryByText('Annotated Classics')).not.toBeInTheDocument())
    expect(screen.getByText('Partidas inmortales comentadas')).toBeInTheDocument()
    expect(useSettingsStore.getState().hiddenExamples).toEqual([2])
    unmount()
    wrap(<SettingsPanel onClose={() => {}} />)
    fireEvent.click(screen.getByRole('button', { name: 'Show all examples (1 hidden)' }))
    expect(useSettingsStore.getState().hiddenExamples).toEqual([])
  })

  it('with the resources token, the books of the repository are listed too', async () => {
    useSettingsStore.setState({ commentDbToken: 'ghp_x' })
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (String(url).includes('/api/library/books')) return new Response(JSON.stringify(EXAMPLES))
      if (String(url).endsWith('books.json')) return new Response(JSON.stringify([{ id: 'al-ataque', title: 'Al ataque', author: 'Tal', lang: 'es', cover: null, thumb: 'data:image/jpeg;base64,AA==', games: 41, topPlayers: [], period: [1950, 1960] }]))
      return new Response('[]')
    }))
    wrap(<LibraryGrid />)
    expect(await screen.findByText('Al ataque')).toBeInTheDocument()
    expect(screen.getByText(/41 games/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Read Al ataque' })).toBeInTheDocument()
    // The whole cover is shown, never cropped or stretched.
    const cover = screen.getByAltText('Cover of Al ataque')
    expect(cover.className).toContain('object-contain')
    expect(cover.className).not.toContain('object-cover')
  })
})
