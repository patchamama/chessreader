import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import React from 'react'

vi.mock('../../../shared/api/httpClient', () => ({ httpClient: vi.fn() }))
vi.mock('../../../shared/api/serverSession', () => ({ hasServerSession: vi.fn(() => true) }))

import { httpClient } from '../../../shared/api/httpClient'
import { useChapter } from '../api/libraryApi'
import { useErrataContext } from './errataContext'
import { SAMPLE } from './errataFixture'

const http = vi.mocked(httpClient)
const HTML = '<p>Smith – Jones</p><p>1. e4 e5 2. Nf3 Nc6 3. Bb4!? a6 4. Ba4 Nf6 5. O-O Be7</p>'

function wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return React.createElement(QueryClientProvider, { client: qc }, children)
}

function serve(errata: () => Promise<unknown>) {
  http.mockImplementation(async (url: string) => {
    if (url === '/api/library/books/7/chapters/2') return { title: 'Two', html: HTML, toc: [] }
    if (url === '/api/library/books') return [{ id: 7, title: 'Smith Games', author: '', createdAt: '', description: '' }]
    if (url.startsWith('/api/errata')) return errata()
    throw new Error(`unexpected ${url}`)
  })
}

beforeEach(() => {
  vi.mocked(httpClient).mockReset()
  useErrataContext.setState({ bookId: null, bookTitle: null, chapter: null, applied: [] })
})

describe('useChapter with errata', () => {
  it('applies the errata of the book and chapter to the main line', async () => {
    serve(async () => ({ entries: [SAMPLE] }))
    const { result } = renderHook(() => useChapter(7, 2), { wrapper })
    await waitFor(() => expect(result.current.data).toBeDefined())
    expect(result.current.data!.html).toContain('errata-corrected')
    expect(result.current.data!.html).toContain('<del class="line-through">Bb4!?</del>')
    expect(http).toHaveBeenCalledWith('/api/errata?book=smith-games&chapter=2', { method: 'GET' })
    await waitFor(() => expect(useErrataContext.getState()).toMatchObject({ bookId: 7, bookTitle: 'Smith Games', chapter: 2 }))
    expect(useErrataContext.getState().applied).toHaveLength(1)
  })

  it('shows the chapter as it is when the errata cannot be read', async () => {
    serve(async () => { throw new Error('500') })
    const { result } = renderHook(() => useChapter(7, 2), { wrapper })
    await waitFor(() => expect(result.current.data).toBeDefined())
    expect(result.current.data!.html).toBe(HTML)
  })
})
