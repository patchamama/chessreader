import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import React from 'react'

vi.mock('../../../shared/api/httpClient', () => ({ httpClient: vi.fn() }))
vi.mock('../errata/chapterErrata', () => ({ withChapterErrata: vi.fn() }))
vi.mock('../../suggestions/suggestionsApi', () => ({ withChapterSuggestions: vi.fn() }))

import { httpClient } from '../../../shared/api/httpClient'
import { withChapterErrata } from '../errata/chapterErrata'
import { withChapterSuggestions } from '../../suggestions/suggestionsApi'
import { useChapter } from './libraryApi'

const http = vi.mocked(httpClient)
const errata = vi.mocked(withChapterErrata)
const suggestions = vi.mocked(withChapterSuggestions)

function wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return React.createElement(QueryClientProvider, { client: qc }, children)
}

beforeEach(() => {
  vi.resetAllMocks()
  http.mockImplementation(async (url: string) => {
    if (url === '/api/library/books') return [{ id: 5, title: 'Sample Book', author: '', createdAt: '', description: '' }]
    return { title: 'Ch', html: '<p>raw</p>', toc: [] }
  })
  errata.mockResolvedValue({ html: '<p>errata</p>', errata: { bookTitle: 'Sample Book', applied: [] } })
})

describe('useChapter', () => {
  it('applies the accepted suggestions of the book and chapter after the errata', async () => {
    suggestions.mockResolvedValue({ html: '<p>suggested</p>', suggestions: { applied: ['s1'], stale: ['s2'] } })
    const { result } = renderHook(() => useChapter(5, 3), { wrapper })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(suggestions).toHaveBeenCalledWith('<p>errata</p>', 'Sample Book', 3)
    expect(result.current.data?.html).toBe('<p>suggested</p>')
    expect(result.current.data?.suggestions).toEqual({ applied: ['s1'], stale: ['s2'] })
  })

  it('keeps the errata text when applying suggestions fails', async () => {
    suggestions.mockRejectedValue(new Error('boom'))
    const { result } = renderHook(() => useChapter(5, 3), { wrapper })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data?.html).toBe('<p>errata</p>')
  })
})
