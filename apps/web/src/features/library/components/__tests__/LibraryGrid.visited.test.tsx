import { beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

const env = vi.hoisted(() => ({
  demo: true,
  books: [] as { id: number; title: string; author: string }[],
  openRepoBook: vi.fn(),
}))
vi.mock('../../api/libraryApi', () => ({ useBooks: () => ({ isLoading: false, data: env.books }) }))
vi.mock('../../../../shared/env/devMode', () => ({ isDemoHost: () => env.demo, isDevMode: () => false, isLocalhostHost: () => true }))
vi.mock('../../commentdb/commentLookup', () => ({ resourcesConfigured: () => true }))
vi.mock('../../../database/resources', () => ({
  loadBooks: async () => [{ id: 'k3', title: 'Mis geniales predecesores III', author: 'Garry Kasparov', lang: 'es', cover: null, thumb: null, games: 89, topPlayers: [], period: null }],
}))
vi.mock('../../../errors/repoBooks', () => ({ openRepoBook: env.openRepoBook }))
vi.mock('../UploadBookForm', () => ({ default: () => null }))
vi.mock('../BookEditModal', () => ({ default: () => null }))

import LibraryGrid from '../LibraryGrid'
import { isVisited, markVisited, resetVisited } from '../../../../shared/visited/visitedStore'

const page = () => render(
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    <MemoryRouter initialEntries={['/library']}>
      <Routes>
        <Route path="/library" element={<LibraryGrid />} />
        <Route path="/read/:id" element={<p>Reader open</p>} />
      </Routes>
    </MemoryRouter>
  </QueryClientProvider>,
)

describe('LibraryGrid: books already opened are marked (reader-analysis S9)', () => {
  beforeEach(() => {
    try { localStorage.clear() } catch { /* no storage */ }
    resetVisited()
    env.demo = true
    env.books = [{ id: 7, title: 'Mi sistema', author: 'A. Nimzowitsch' }, { id: 8, title: 'Otro libro', author: 'X' }]
    env.openRepoBook.mockReset().mockResolvedValue(undefined)
  })

  it('a library book shows the opened mark once it was opened, and opening it records it', async () => {
    markVisited('serverBook', 7)
    page()
    const opened = screen.getByText('Mi sistema').closest('[data-book-card]')!
    expect(opened).toHaveAttribute('data-visited')
    expect(opened.querySelector('[aria-label="Already opened"]')).not.toBeNull()
    const other = screen.getByText('Otro libro').closest('[data-book-card]')!
    expect(other).not.toHaveAttribute('data-visited')
    // Opening it (the cover links to the reader) records it.
    fireEvent.click(screen.getByAltText('Cover of Otro libro'))
    await screen.findByText('Reader open')
    expect(isVisited('serverBook', 8)).toBe(true)
  })

  it('a book of the resources is marked once read, and Read records it', async () => {
    page()
    const read = await screen.findByRole('button', { name: 'Read Mis geniales predecesores III' })
    expect(read.closest('[data-book-card]')).not.toHaveAttribute('data-visited')
    fireEvent.click(read)
    await screen.findByText('Reader open')
    expect(isVisited('repoBook', 'k3')).toBe(true)
    cleanup()
    page()
    const again = await screen.findByRole('button', { name: 'Read Mis geniales predecesores III' })
    await waitFor(() => expect(again.closest('[data-book-card]')).toHaveAttribute('data-visited'))
  })

  it('regression: hiding an example book still works', () => {
    page()
    expect(screen.getByRole('button', { name: 'Hide the example Mi sistema' })).toBeTruthy()
  })
})
