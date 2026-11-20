import { beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import type { CommentEntry } from '../comments/commentsApi'

const llm = vi.hoisted(() => ({ available: true, vision: false, config: null as unknown, complete: vi.fn() }))
vi.mock('../../shared/llm', () => ({ useLlm: () => llm }))
const api = vi.hoisted(() => ({ loadCommentPage: vi.fn(), loadCommentSources: vi.fn(), loadCommentGame: vi.fn() }))
vi.mock('../comments/commentsApi', async (orig) => ({ ...(await orig<typeof import('../comments/commentsApi')>()), ...api }))
const save = vi.hoisted(() => vi.fn())
vi.mock('../suggestions/suggestionsApi', () => ({ saveSuggestion: save }))
vi.mock('./openInBook', () => ({ openGameInBook: vi.fn() }))

import CommentsTab from './CommentsTab'
import { useBusyStore } from '../../shared/layout/busyStore'

const FEN = 'r1bqkb1r/pppp1ppp/1n6/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 0 1'
const book = { id: 1, title: 'Invented Book', author: 'A. Writer', kind: 'book', lang: 'en', book: 'invented-book' }
const entry = (id: number, translations?: Record<string, string>): CommentEntry => ({
  id, hash: '0123456789abcdef', fen: FEN, text: `Remark ${id} keeps c4.`, lang: 'en', ply: 24, move: 12, san: 'Nb6', gameId: '1-4', chapter: 3, source: book,
  game: { white: 'W', black: 'B', label: null }, ...(translations ? { translations } : {}),
})
// 120 comments in the database; the first two pages (50 each) hold ids 1..100. Comment 3 already has Spanish.
const ALL = Array.from({ length: 120 }, (_, i) => entry(i + 1, i === 2 ? { es: 'Ya traducido.' } : undefined))

beforeEach(() => {
  cleanup()
  llm.available = true
  llm.complete.mockReset()
  llm.complete.mockImplementation(async () => ({ text: '{"text":"Remark keeps c4."}', model: 'm' }))
  save.mockReset()
  save.mockResolvedValue({ saved: true, where: 'server', path: 'p' })
  api.loadCommentPage.mockReset()
  api.loadCommentPage.mockImplementation(async (_f: unknown, offset: number, limit: number) => ({ total: ALL.length, comments: ALL.slice(offset, offset + limit) }))
  api.loadCommentSources.mockResolvedValue([])
  useBusyStore.setState({ tasks: [] })
})

const show = () => render(<MemoryRouter><CommentsTab books={[]} /></MemoryRouter>)

describe('Comments batch over the whole database (S1)', () => {
  it('selects every comment matching the filter, across pages, and shows a progress bar for the whole batch', async () => {
    show()
    await screen.findByRole('listitem', { name: 'Comment 1' })
    fireEvent.click(screen.getByRole('button', { name: 'Select all 120 matching the filter' }))
    fireEvent.change(screen.getByRole('combobox', { name: 'Batch action' }), { target: { value: 'translate:es' } })
    fireEvent.click(screen.getByRole('button', { name: 'Run on 120 matching' }))
    const bar = await screen.findByRole('progressbar', { name: 'Batch progress' })
    await waitFor(() => expect(bar.getAttribute('aria-valuenow')).toBe('120'))
    expect(bar.getAttribute('aria-valuemax')).toBe('120')
    const text = screen.getByTestId('batch-progress').textContent
    expect(text).toContain('120/120')
    expect(text).toContain('1 skipped')
    expect(text).toContain('119 saved')
    expect(save).toHaveBeenCalledTimes(119)
    // paged lazily: never more than 50 comments per request
    expect(api.loadCommentPage.mock.calls.slice(1).every((c) => c[2] <= 50)).toBe(true)
  })

  it('overwrites existing translations only when asked', async () => {
    show()
    await screen.findByRole('listitem', { name: 'Comment 1' })
    fireEvent.click(screen.getByRole('checkbox', { name: 'Select comment 3' }))
    fireEvent.change(screen.getByRole('combobox', { name: 'Batch action' }), { target: { value: 'translate:es' } })
    fireEvent.click(screen.getByRole('button', { name: 'Run on 1 selected' }))
    await waitFor(() => expect(screen.getByTestId('batch-progress').textContent).toContain('1 skipped'))
    expect(save).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('checkbox', { name: 'Overwrite existing translations' }))
    fireEvent.click(screen.getByRole('button', { name: 'Run on 1 selected' }))
    await waitFor(() => expect(save).toHaveBeenCalledTimes(1))
  })

  it('does universal and translation in one batch', async () => {
    show()
    await screen.findByRole('listitem', { name: 'Comment 1' })
    fireEvent.click(screen.getByRole('checkbox', { name: 'Select comment 1' }))
    fireEvent.change(screen.getByRole('combobox', { name: 'Batch action' }), { target: { value: 'both:de' } })
    fireEvent.click(screen.getByRole('button', { name: 'Run on 1 selected' }))
    await waitFor(() => expect(save).toHaveBeenCalledTimes(2))
    expect(save.mock.calls.map((c) => c[0].after.action).sort()).toEqual(['translate', 'universal'])
  })

  it('cancels from the progress bar and keeps the counts', async () => {
    let release!: () => void
    llm.complete.mockImplementationOnce(() => new Promise((r) => { release = () => r({ text: '{"text":"Remark keeps c4."}', model: 'm' }) }))
    show()
    await screen.findByRole('listitem', { name: 'Comment 1' })
    fireEvent.click(screen.getByRole('button', { name: 'Select all 120 matching the filter' }))
    fireEvent.click(screen.getByRole('button', { name: 'Run on 120 matching' }))
    const panel = await screen.findByTestId('batch-progress')
    fireEvent.click(within(panel).getByRole('button', { name: 'Cancel batch' }))
    release()
    await waitFor(() => expect(screen.getByTestId('batch-progress').textContent).toContain('cancelled'))
    expect(save).toHaveBeenCalledTimes(1)
  })
})
