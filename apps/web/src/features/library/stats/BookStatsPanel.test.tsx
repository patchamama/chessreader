import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import BookStatsPanel from './BookStatsPanel'
import * as stats from './bookStats'

vi.mock('./bookStats', async (orig) => ({ ...(await orig<object>()), loadBookStats: vi.fn(), saveBookStats: vi.fn(), computeBookStats: vi.fn(), computeChaptersStats: vi.fn() }))

const S = { games: 12, plies: 840, variations: 77, comments: 5, errors: 3, analysedAt: '2026-11-21T10:00:00.000Z', version: '0.135.0' }
beforeEach(() => { vi.clearAllMocks(); vi.mocked(stats.saveBookStats).mockResolvedValue() })

describe('BookStatsPanel', () => {
  it('offers only a details button for a book never analysed, and computes nothing until asked', async () => {
    vi.mocked(stats.loadBookStats).mockResolvedValue(null)
    render(<BookStatsPanel bookId={1} title="B" />)
    expect(await screen.findByRole('button', { name: 'Show book details' })).toBeInTheDocument()
    expect(screen.queryByLabelText(/games found/i)).toBeNull()
    expect(stats.computeBookStats).not.toHaveBeenCalled()
  })

  it('shows the numbers already computed at once, with a hint each and no details button', async () => {
    vi.mocked(stats.loadBookStats).mockResolvedValue(S)
    render(<BookStatsPanel bookId={1} title="B" />)
    expect(await screen.findByLabelText('Games found: 12')).toHaveAttribute('title', expect.stringContaining('Games found'))
    expect(screen.getByLabelText('Main-line moves: 840')).toBeInTheDocument()
    expect(screen.getByLabelText('Variations: 77')).toBeInTheDocument()
    expect(screen.getByLabelText('Comments: 5')).toBeInTheDocument()
    expect(screen.getByLabelText('Recognition errors: 3')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Show book details' })).toBeNull()
    expect(stats.computeBookStats).not.toHaveBeenCalled()
  })

  it('computes and saves them when asked and none were stored', async () => {
    vi.mocked(stats.loadBookStats).mockResolvedValue(null)
    vi.mocked(stats.computeBookStats).mockResolvedValue(S)
    render(<BookStatsPanel bookId={4} title="B" />)
    fireEvent.click(await screen.findByRole('button', { name: 'Show book details' }))
    expect(await screen.findByLabelText('Games found: 12')).toBeInTheDocument()
    expect(stats.saveBookStats).toHaveBeenCalledWith(4, S, 'B')
  })

  it('refresh recomputes and saves the new numbers', async () => {
    vi.mocked(stats.loadBookStats).mockResolvedValue(S)
    vi.mocked(stats.computeBookStats).mockResolvedValue({ ...S, games: 13 })
    render(<BookStatsPanel bookId={4} title="B" />)
    await screen.findByLabelText('Games found: 12')
    fireEvent.click(screen.getByRole('button', { name: 'Refresh book details' }))
    expect(await screen.findByLabelText('Games found: 13')).toBeInTheDocument()
    await waitFor(() => expect(stats.saveBookStats).toHaveBeenCalledWith(4, { ...S, games: 13 }, 'B'))
  })

  it('reports a failure to compute', async () => {
    vi.mocked(stats.loadBookStats).mockResolvedValue(null)
    vi.mocked(stats.computeBookStats).mockRejectedValue(new Error('boom'))
    render(<BookStatsPanel bookId={4} title="B" />)
    fireEvent.click(await screen.findByRole('button', { name: 'Show book details' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('boom')
  })

  it('the comments number is a link to the database comments of that book', async () => {
    vi.mocked(stats.loadBookStats).mockResolvedValue(S)
    render(<MemoryRouter><BookStatsPanel bookId={4} title="Mis geniales & más" /></MemoryRouter>)
    const link = await screen.findByRole('link', { name: 'Comments: 5' })
    expect(link).toHaveAttribute('href', `/database?tab=comments&book=${encodeURIComponent('Mis geniales & más')}`)
    expect(link).toHaveAttribute('title', expect.stringContaining('Open'))
  })
})
