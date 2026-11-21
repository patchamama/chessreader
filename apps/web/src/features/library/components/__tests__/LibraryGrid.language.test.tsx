import { beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

const env = vi.hoisted(() => ({
  demo: false,
  books: [] as { id: number; title: string; author: string; language?: string }[],
}))
vi.mock('../../api/libraryApi', () => ({ useBooks: () => ({ isLoading: false, data: env.books }) }))
vi.mock('../../../../shared/env/devMode', () => ({ isDemoHost: () => env.demo, isDevMode: () => false, isLocalhostHost: () => true }))
vi.mock('../../commentdb/commentLookup', () => ({ resourcesConfigured: () => true }))
vi.mock('../../../database/resources', () => ({
  loadBooks: async () => [{ id: 'k3', title: 'Mis geniales predecesores III', author: 'Garry Kasparov', lang: 'es', cover: null, thumb: null, games: 89, topPlayers: [], period: null }],
}))
vi.mock('../../../errors/repoBooks', () => ({ openRepoBook: vi.fn() }))
vi.mock('../UploadBookForm', () => ({ default: () => null }))
vi.mock('../BookEditModal', () => ({ default: () => null }))

import LibraryGrid from '../LibraryGrid'

const page = () => render(
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    <MemoryRouter><LibraryGrid /></MemoryRouter>
  </QueryClientProvider>,
)
const titles = () => screen.queryAllByRole('heading', { level: 2 }).map((h) => h.textContent)

describe('LibraryGrid: language of each book and filter (epub-language S1)', () => {
  beforeEach(() => {
    cleanup()
    try { localStorage.clear() } catch { /* no storage */ }
    env.demo = false
    env.books = [
      { id: 1, title: 'My System', author: 'A', language: 'en' },
      { id: 2, title: 'Fundamentos', author: 'B', language: 'es' },
      { id: 3, title: 'Endgames', author: 'C', language: 'en' },
      { id: 4, title: 'Mystery', author: 'D', language: '' },
    ]
  })

  it('shows each book language as a badge with the language name', () => {
    page()
    const badge = screen.getAllByLabelText('Language: English')
    expect(badge).toHaveLength(2)
    expect(badge[0]).toHaveTextContent('EN')
    expect(screen.getByLabelText('Language: Spanish')).toHaveTextContent('ES')
  })

  it('shows no badge for a book with an unknown language', () => {
    env.books = [{ id: 4, title: 'Mystery', author: 'D', language: '' }]
    page()
    expect(screen.queryByLabelText(/^Language:/)).toBeNull()
    expect(screen.queryByLabelText('Filter by language')).toBeNull()
  })

  it('lists the present languages with counts, plus All', () => {
    page()
    const filter = screen.getByLabelText('Filter by language') as HTMLSelectElement
    expect(within(filter).getAllByRole('option').map((o) => o.textContent)).toEqual(['All (4)', 'English (2)', 'Spanish (1)'])
    expect(filter.value).toBe('')
  })

  it('filters the books by the chosen language and back to all', () => {
    page()
    fireEvent.change(screen.getByLabelText('Filter by language'), { target: { value: 'en' } })
    expect(titles()).toEqual(['My System', 'Endgames'])
    fireEvent.change(screen.getByLabelText('Filter by language'), { target: { value: 'es' } })
    expect(titles()).toEqual(['Fundamentos'])
    fireEvent.change(screen.getByLabelText('Filter by language'), { target: { value: '' } })
    expect(titles()).toHaveLength(4)
  })

  it('remembers the choice in localStorage', () => {
    const first = page()
    fireEvent.change(screen.getByLabelText('Filter by language'), { target: { value: 'es' } })
    first.unmount()
    page()
    expect((screen.getByLabelText('Filter by language') as HTMLSelectElement).value).toBe('es')
    expect(titles()).toEqual(['Fundamentos'])
  })

  it('falls back to All when the remembered language no longer exists', () => {
    localStorage.setItem('library.language', 'de')
    page()
    expect(titles()).toHaveLength(4)
  })

  it('works when localStorage throws', () => {
    const spy = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('blocked') })
    const set = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('blocked') })
    page()
    fireEvent.change(screen.getByLabelText('Filter by language'), { target: { value: 'en' } })
    expect(titles()).toEqual(['My System', 'Endgames'])
    spy.mockRestore()
    set.mockRestore()
  })

  it('filters the resources repository books too, by their lang', async () => {
    env.demo = true
    env.books = [{ id: 1, title: 'My System', author: 'A', language: 'en' }]
    page()
    expect(await screen.findByText('Mis geniales predecesores III')).toBeInTheDocument()
    expect(screen.getByLabelText('Language: Spanish')).toHaveTextContent('ES')
    fireEvent.change(screen.getByLabelText('Filter by language'), { target: { value: 'en' } })
    expect(screen.queryByText('Mis geniales predecesores III')).toBeNull()
    expect(screen.getByText('My System')).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('Filter by language'), { target: { value: 'es' } })
    expect(screen.getByText('Mis geniales predecesores III')).toBeInTheDocument()
    expect(screen.queryByText('My System')).toBeNull()
  })
})
