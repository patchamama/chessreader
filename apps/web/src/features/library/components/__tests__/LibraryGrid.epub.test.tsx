import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

const env = vi.hoisted(() => ({ demo: false, server: true, download: vi.fn() }))
vi.mock('../../api/libraryApi', () => ({ useBooks: () => ({ isLoading: false, data: [{ id: 7, title: 'Mi sistema', author: 'A. N.', createdAt: '2026-01-01', description: '' }] }) }))
vi.mock('../../../../shared/env/devMode', () => ({ isDemoHost: () => env.demo, isDevMode: () => false, isLocalhostHost: () => true }))
vi.mock('../../../../shared/api/serverSession', () => ({ hasServerSession: () => env.server }))
vi.mock('../../../suggestions/epubApi', () => ({ downloadEpub: env.download, listBookImages: async () => [], uploadSuggestionAsset: vi.fn() }))
vi.mock('../../commentdb/commentLookup', () => ({ resourcesConfigured: () => false }))
vi.mock('../UploadBookForm', () => ({ default: () => null }))
vi.mock('../BookEditModal', () => ({ default: () => null }))

import LibraryGrid from '../LibraryGrid'

const page = () => render(
  <QueryClientProvider client={new QueryClient()}>
    <MemoryRouter><LibraryGrid /></MemoryRouter>
  </QueryClientProvider>,
)

describe('LibraryGrid: download the EPUB and suggest a cover (S6)', () => {
  beforeEach(() => { vi.clearAllMocks(); env.demo = false; env.server = true })

  it('a server book downloads its EPUB', async () => {
    env.download.mockResolvedValue(undefined)
    page()
    fireEvent.click(screen.getByRole('button', { name: 'Download EPUB of Mi sistema' }))
    await waitFor(() => expect(env.download).toHaveBeenCalledWith(7, 'Mi sistema'))
  })

  it('a refused download shows why', async () => {
    env.download.mockRejectedValue(new Error('only the owner or an admin can download this book'))
    page()
    fireEvent.click(screen.getByRole('button', { name: 'Download EPUB of Mi sistema' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('only the owner or an admin')
  })

  it('Cover… opens the cover dialog of the book', async () => {
    page()
    fireEvent.click(screen.getByRole('button', { name: 'Cover of Mi sistema…' }))
    expect(await screen.findByRole('dialog', { name: 'Cover of Mi sistema' })).toBeInTheDocument()
  })

  it('without a server (the deploy) there is neither download nor cover action', () => {
    env.server = false
    page()
    expect(screen.queryByRole('button', { name: /Download EPUB/ })).toBeNull()
    expect(screen.queryByRole('button', { name: /Cover of Mi sistema…/ })).toBeNull()
  })
})
