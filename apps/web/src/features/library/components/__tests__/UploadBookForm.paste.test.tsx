import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import UploadBookForm from '../UploadBookForm'
import { useExternalBookStore } from '../../../../shared/externalBook/externalBookStore'

vi.mock('../../api/libraryApi', () => ({
  useUploadBook: () => ({ mutateAsync: vi.fn(), isPending: false, isError: false, error: null }),
}))

describe('UploadBookForm, paste text', () => {
  it('opens pasted text in the reader', () => {
    render(
      <QueryClientProvider client={new QueryClient()}>
        <MemoryRouter initialEntries={['/library']}>
          <Routes>
            <Route path="/library" element={<UploadBookForm />} />
            <Route path="/read/:bookId" element={<p>reader</p>} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    )
    fireEvent.click(screen.getByRole('tab', { name: 'Paste text' }))
    fireEvent.change(screen.getByLabelText('Text or PGN'), { target: { value: 'Opera\n1. e4 e5 2. Nf3 d6' } })
    fireEvent.click(screen.getByRole('button', { name: 'Open in reader' }))
    expect(screen.getByText('reader')).toBeInTheDocument()
    const book = useExternalBookStore.getState()
    expect(book.title).toBe('Opera')
    expect(book.chapters[0].html).toContain('<p>1. e4 e5 2. Nf3 d6</p>')
  })
})
