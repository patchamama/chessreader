import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, fireEvent, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import BookReader from '../BookReader'

const h = vi.hoisted(() => ({ chapter: { data: { title: 'Chapter', html: '<p>Some prose.</p>', toc: [] as never[] }, isLoading: false } }))
vi.mock('../../api/libraryApi', () => ({
  useChapter: () => h.chapter,
  useTouchBook: () => ({ mutate: vi.fn(), isPending: false }),
  useBookTitle: () => null,
}))

vi.mock('react-chessboard', () => ({ Chessboard: () => <div data-testid="chessboard" /> }))
vi.mock('../../../../shared/stockfish/useStockfishEval', () => ({
  useStockfishEval: () => ({ loading: false, scoreCp: 0, depth: 10 }),
}))

function mount() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={['/read/7']}>
        <Routes><Route path="/read/:bookId" element={<BookReader />} /></Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('reader text zoom', () => {
  beforeEach(() => localStorage.clear())

  it('scales only the text column, remembers it and resets', () => {
    mount()
    const column = screen.getByTestId('reader-column')
    expect(column.getAttribute('style') ?? '').not.toContain('--reader-zoom')
    fireEvent.click(screen.getByRole('button', { name: 'Zoom text in' }))
    expect(column.getAttribute('style')).toContain('--reader-zoom: 1.1')
    expect(screen.getByRole('button', { name: 'Reset text zoom' }).textContent).toBe('110%')
    expect(localStorage.getItem('reader-text-zoom')).toBe('110')
    fireEvent.click(screen.getByRole('button', { name: 'Reset text zoom' }))
    expect(column.getAttribute('style') ?? '').not.toContain('--reader-zoom')
  })
})
