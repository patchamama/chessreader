import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import type { LoadedSuggestion } from '../suggestions/suggestionFormat'
import { SAMPLE } from '../library/errata/errataFixture'

const env = vi.hoisted(() => ({
  server: true,
  books: [{ id: 7, title: 'Smith Games' }] as { id: number; title: string }[],
  load: vi.fn(),
  update: vi.fn(),
  errata: vi.fn(),
  apply: vi.fn(),
  restore: vi.fn(),
  blob: vi.fn(),
}))

vi.mock('../library/api/libraryApi', () => ({ useBooks: () => ({ data: env.books }) }))
vi.mock('../../shared/api/serverSession', () => ({ hasServerSession: () => env.server }))
vi.mock('../../shared/env/devMode', () => ({ isLocalhostHost: () => false, isDemoHost: () => !env.server, isDevMode: () => false }))
vi.mock('../suggestions/suggestionsApi', () => ({ loadSuggestions: env.load, updateSuggestionStatus: env.update }))
vi.mock('../suggestions/errataReview', () => ({ loadErrataForReview: env.errata }))
vi.mock('../suggestions/epubApi', async (orig) => ({
  ...(await orig<typeof import('../suggestions/epubApi')>()),
  applySuggestionsToEpub: env.apply, restoreBackup: env.restore, authBlobUrl: env.blob,
}))

import SuggestionsReview from './SuggestionsReview'
import { useAuthStore } from '../auth/store/authStore'

const ASSET = `/api/suggestions/assets/${'a'.repeat(64)}.png`

const item = (over: Partial<LoadedSuggestion>): LoadedSuggestion => ({
  id: 'x', kind: 'text', target: { book: 'Smith Games', chapter: 2 }, before: 'old placeholder words', after: 'new placeholder words',
  author: 'user', status: 'pending', createdAt: '2026-11-20T10:00:00.000Z', origin: 'server', origins: ['server'], ...over,
})

const page = () => render(
  <MemoryRouter initialEntries={['/errors']}>
    <Routes>
      <Route path="/errors" element={<SuggestionsReview />} />
      <Route path="/read/:id" element={<p>Reader open</p>} />
    </Routes>
  </MemoryRouter>,
)

describe('Errors → Suggestions review (S5, S6)', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    env.server = true
    useAuthStore.setState({ token: 't', user: { email: 'a@x', role: 'admin', status: 'approved' } })
    env.errata.mockResolvedValue([])
    env.update.mockResolvedValue({ ok: true, updated: ['server'] })
    env.blob.mockResolvedValue('blob:asset')
  })
  afterEach(() => useAuthStore.setState({ token: null, user: null }))

  it('lists server and resources suggestions with a text diff and filters them by kind, status and origin', async () => {
    env.load.mockResolvedValue([
      item({ id: 't1' }),
      item({ id: 'c1', kind: 'comment', status: 'accepted', origin: 'resources', origins: ['resources'], after: 'universal comment' }),
    ])
    page()
    const t1 = await screen.findByRole('listitem', { name: 'Suggestion t1' })
    expect(within(t1).getByText('old', { selector: 'del' })).toBeInTheDocument()
    expect(within(t1).getByText('new', { selector: 'ins' })).toBeInTheDocument()
    expect(screen.getByRole('listitem', { name: 'Suggestion c1' })).toHaveTextContent('resources')

    fireEvent.change(screen.getByLabelText('Origin'), { target: { value: 'resources' } })
    expect(screen.queryByRole('listitem', { name: 'Suggestion t1' })).toBeNull()
    fireEvent.change(screen.getByLabelText('Origin'), { target: { value: '' } })
    fireEvent.change(screen.getByLabelText('Kind'), { target: { value: 'text' } })
    expect(screen.queryByRole('listitem', { name: 'Suggestion c1' })).toBeNull()
    fireEvent.change(screen.getByLabelText('Kind'), { target: { value: '' } })
    fireEvent.change(screen.getByLabelText('Status'), { target: { value: 'accepted' } })
    expect(screen.queryByRole('listitem', { name: 'Suggestion t1' })).toBeNull()
    expect(env.load).toHaveBeenCalledWith({})
  })

  it('accepts a selection in batch and then offers Apply to EPUB to the admin, with undo', async () => {
    env.load.mockResolvedValue([item({ id: 't1' }), item({ id: 't2' })])
    page()
    await screen.findByRole('listitem', { name: 'Suggestion t1' })
    fireEvent.click(screen.getByLabelText(/Select all/))
    fireEvent.click(screen.getByRole('button', { name: 'Accept' }))
    await screen.findByText(/2 accepted/)
    expect(env.update).toHaveBeenCalledTimes(2)
    expect(env.update.mock.calls.map((c) => c[1])).toEqual(['accepted', 'accepted'])

    env.apply.mockResolvedValue({ applied: ['t1', 't2'], stale: [], backup: '7-20261120T100000Z.epub' })
    env.load.mockResolvedValue([item({ id: 't1', status: 'applied' }), item({ id: 't2', status: 'applied' })])
    fireEvent.click(screen.getByRole('button', { name: 'Apply to EPUB: Smith Games (2)' }))
    await screen.findByText(/2 applied, 0 stale · backup 7-20261120T100000Z.epub/)
    expect(env.apply).toHaveBeenCalledWith(7)

    env.restore.mockResolvedValue({ restored: '7-20261120T100000Z.epub', backup: '7-20261120T100100Z.epub', reverted: ['t1', 't2'], reapplied: [] })
    fireEvent.click(screen.getByRole('button', { name: /Undo/ }))
    await screen.findByText(/restored 7-20261120T100000Z.epub/)
    expect(env.restore).toHaveBeenCalledWith(7, '7-20261120T100000Z.epub')
  })

  it('a non-admin never sees Apply to EPUB', async () => {
    useAuthStore.setState({ token: 't', user: { email: 'u@x', role: 'user', status: 'approved' } })
    env.load.mockResolvedValue([item({ id: 't1', status: 'accepted' })])
    page()
    await screen.findByRole('listitem', { name: 'Suggestion t1' })
    expect(screen.queryByRole('button', { name: /Apply to EPUB/ })).toBeNull()
  })

  it('shows uploaded images through an authenticated blob URL and diagram FENs as thumbnails', async () => {
    env.load.mockResolvedValue([
      item({ id: 'k1', kind: 'cover', before: null, after: { src: ASSET } }),
      item({ id: 'f1', kind: 'diagram-fen', target: { book: 'Smith Games', chapter: 2, image: '/api/library/books/7/images/d.png' }, after: { fen: '8/8/8/8/8/8/8/K6k w - - 0 1' } }),
    ])
    page()
    expect(await screen.findByAltText('Cover after')).toHaveAttribute('src', 'blob:asset')
    expect(env.blob).toHaveBeenCalledWith(ASSET)
    expect(screen.getByAltText('Cover before')).toHaveAttribute('src', '/api/library/books/7/cover')
    expect(screen.getByAltText('Diagram image')).toHaveAttribute('src', '/api/library/books/7/images/d.png')
    expect(screen.getByAltText('Position 8/8/8/8/8/8/8/K6k w - - 0 1').getAttribute('src')).toMatch(/^data:image\/svg\+xml/)
  })

  it('errata appear as read-only move items that open the game in the book', async () => {
    env.load.mockResolvedValue([])
    env.errata.mockResolvedValue([{ ...SAMPLE, origin: 'server' }])
    page()
    const row = await screen.findByRole('listitem', { name: `Erratum ${SAMPLE.id}` })
    expect(row).toHaveTextContent('Bb4!?')
    expect(within(row).queryByRole('checkbox')).toBeNull()
    fireEvent.click(within(row).getByRole('button', { name: 'Open in the book' }))
    await screen.findByText('Reader open')
  })

  it('in the deploy an accepted resources suggestion can commit its status to the repository', async () => {
    env.server = false
    useAuthStore.setState({ token: null, user: null })
    env.load.mockResolvedValue([item({ id: 'r1', status: 'accepted', origin: 'resources', origins: ['resources'] })])
    env.update.mockResolvedValue({ ok: true, updated: ['resources'] })
    page()
    fireEvent.click(await screen.findByRole('button', { name: 'Commit status to resources' }))
    await waitFor(() => expect(env.update).toHaveBeenCalledWith(expect.objectContaining({ id: 'r1' }), 'accepted'))
    expect(screen.queryByRole('button', { name: /Apply to EPUB/ })).toBeNull()
  })
})
