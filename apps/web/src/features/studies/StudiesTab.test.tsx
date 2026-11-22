import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import StudiesTab from './StudiesTab'
import type { StudiesClient, Study } from './studiesApi'
import { useExternalBookStore } from '../../shared/externalBook/externalBookStore'

const mk = (id: string, o: Partial<Study> = {}): Study => ({ id, name: id, author: null, chapters: 2, games: 2, comments: 5, linkedIds: [], groupId: null, partOrder: null, isBook: false, source: 'lichess', updatedAt: '2025-01-02T00:00:00Z', importedAt: '2025-02-01T00:00:00Z', myRating: null, lichessLikes: null, ...o })
const PGN = '[Event "S"]\n[ChapterName "Game one"]\n\n1. e4 { Hi. } e5 *\n\n[Event "S"]\n[ChapterName "Game two"]\n\n1. d4 d5 *'

function fake(studies: Study[], extra: Partial<StudiesClient> = {}): StudiesClient {
  return {
    list: vi.fn(async () => ({ studies, authors: [{ author: 'ann', count: 1 }, { author: 'bob', count: 1 }] })),
    get: vi.fn(async (id: string) => ({ study: studies.find((s) => s.id === id)!, pgn: PGN })),
    importStudy: vi.fn(async (id: string) => ({ imported: [mk(id)], skipped: [], linked: [], errors: [] })),
    listUser: vi.fn(async (h: string) => ({ user: h, studies: [{ id: 'u1u1u1u1', name: 'Their study', createdAt: 1, updatedAt: 1700000000000, imported: false }, { id: 'u2u2u2u2', name: 'Done study', createdAt: 1, updatedAt: 1700000000000, imported: true }] })),
    update: vi.fn(async (id: string, patch) => ({ ...studies.find((s) => s.id === id)!, ...patch })),
    remove: vi.fn(async () => 1),
    syncComments: vi.fn(async () => ({ added: 3, studies: 9 })),
    ...extra,
  }
}
const renderTab = (c: StudiesClient) => render(<MemoryRouter><StudiesTab client={c} /></MemoryRouter>)
const names = () => screen.getAllByTestId('study-name').map((e) => e.textContent)

beforeEach(() => { vi.spyOn(window, 'confirm').mockReturnValue(true) })
afterEach(() => { cleanup(); vi.restoreAllMocks() })

describe('StudiesTab', () => {
  it('lists studies sorted by name with author, counts and source', async () => {
    renderTab(fake([mk('b-study', { author: 'bob' }), mk('a-study', { author: 'ann', source: 'comments' })]))
    await screen.findByText('a-study')
    expect(names()).toEqual(['a-study', 'b-study'])
    expect(screen.getByText('commentary DB')).toBeInTheDocument()
  })
  it('shows an empty state and errors', async () => {
    renderTab(fake([]))
    expect(await screen.findByText(/No studies yet/)).toBeInTheDocument()
    cleanup()
    renderTab(fake([], { list: vi.fn().mockRejectedValue(new Error('boom')) }))
    expect(await screen.findByRole('alert')).toHaveTextContent('boom')
  })
  it('marks books with an icon and lists the parts of a group under one row', async () => {
    renderTab(fake([mk('root', { name: 'My System', isBook: true, groupId: 'root', partOrder: 1 }), mk('part2', { name: 'My System 2', isBook: true, groupId: 'root', partOrder: 2 })]))
    await screen.findByText('My System')
    expect(screen.getAllByTestId('study-name')).toHaveLength(1)
    expect(screen.getByTitle(/Book made of linked parts/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /Show parts of My System/ }))
    expect(screen.getByText(/My System 2/)).toBeInTheDocument()
  })
  it('sorts by clicking a header and toggles direction', async () => {
    renderTab(fake([mk('a', { myRating: 2 }), mk('b', { myRating: 5 }), mk('c')]))
    await screen.findByText('a')
    fireEvent.click(screen.getByRole('button', { name: 'Sort by my rating' }))
    expect(names()).toEqual(['a', 'b', 'c'])
    fireEvent.click(screen.getByRole('button', { name: 'Sort by my rating' }))
    expect(names()).toEqual(['b', 'a', 'c'])
  })
  it('filters by text and by author', async () => {
    renderTab(fake([mk('alpha', { author: 'ann' }), mk('beta', { author: 'bob' })]))
    await screen.findByText('alpha')
    fireEvent.change(screen.getByLabelText('Filter studies'), { target: { value: 'bet' } })
    expect(names()).toEqual(['beta'])
    fireEvent.change(screen.getByLabelText('Filter studies'), { target: { value: '' } })
    fireEvent.change(screen.getByLabelText('Author'), { target: { value: 'ann' } })
    expect(names()).toEqual(['alpha'])
  })
  it('rates a study and saves likes', async () => {
    const c = fake([mk('a')])
    renderTab(c)
    await screen.findByText('a')
    fireEvent.click(screen.getByRole('button', { name: '4 stars' }))
    await waitFor(() => expect(c.update).toHaveBeenCalledWith('a', { myRating: 4 }))
    const likes = screen.getByLabelText('Lichess likes of a')
    fireEvent.change(likes, { target: { value: '12' } })
    fireEvent.blur(likes)
    await waitFor(() => expect(c.update).toHaveBeenCalledWith('a', { lichessLikes: 12 }))
  })
  it('deletes after a confirm, with its parts for a group', async () => {
    const c = fake([mk('r', { isBook: true, groupId: 'r', partOrder: 1 }), mk('p', { isBook: true, groupId: 'r', partOrder: 2 })])
    renderTab(c)
    await screen.findByText('r')
    fireEvent.click(screen.getByRole('button', { name: 'Delete r' }))
    await waitFor(() => expect(c.remove).toHaveBeenCalledWith('r', true))
  })
  it('syncs from the commentary database and shows the result', async () => {
    const c = fake([mk('a')])
    renderTab(c)
    await screen.findByText('a')
    fireEvent.click(screen.getByRole('button', { name: /Sync from commentary database/ }))
    expect(await screen.findByText(/3 added/)).toBeInTheDocument()
  })
  it('imports pasted links one by one with progress and a summary', async () => {
    const c = fake([])
    renderTab(c)
    await screen.findByText(/No studies yet/)
    fireEvent.change(screen.getByLabelText('Study links'), { target: { value: 'lichess.org/study/aaaaaaaa\nhttps://lichess.org/study/bbbbbbbb/cccccccc' } })
    fireEvent.click(screen.getByLabelText('Follow links to other parts (book)'))
    fireEvent.click(screen.getByRole('button', { name: 'Import' }))
    expect(await screen.findByText(/Imported 2 studies/)).toBeInTheDocument()
    expect(c.importStudy).toHaveBeenNthCalledWith(1, 'aaaaaaaa', { follow: true })
    expect(c.importStudy).toHaveBeenNthCalledWith(2, 'bbbbbbbb', { follow: true })
  })
  it('sends the typed parts', async () => {
    const c = fake([])
    renderTab(c)
    await screen.findByText(/No studies yet/)
    fireEvent.change(screen.getByLabelText('Study links'), { target: { value: 'aaaaaaaa' } })
    fireEvent.change(screen.getByLabelText('Parts'), { target: { value: 'lichess.org/study/CaZ01HLL MLvmSIiK' } })
    fireEvent.click(screen.getByRole('button', { name: 'Import' }))
    await screen.findByText(/Imported 1 stud/)
    expect(c.importStudy).toHaveBeenCalledWith('aaaaaaaa', { parts: ['CaZ01HLL', 'MLvmSIiK'] })
  })
  it('lists the studies of an author and imports the selected ones', async () => {
    const c = fake([])
    renderTab(c)
    await screen.findByText(/No studies yet/)
    fireEvent.change(screen.getByLabelText('Lichess handle'), { target: { value: 'Someone' } })
    fireEvent.click(screen.getByRole('button', { name: 'List studies' }))
    await screen.findByText('Their study')
    expect(c.listUser).toHaveBeenCalledWith('Someone')
    fireEvent.click(screen.getByLabelText('Select Their study'))
    fireEvent.click(screen.getByRole('button', { name: 'Import selected' }))
    await screen.findByText(/Imported 1 stud/)
    expect(c.importStudy).toHaveBeenCalledWith('u1u1u1u1', {})
  })
  it('opens a study as a continuous book or one chapter per game', async () => {
    const c = fake([mk('a', { name: 'My study' })])
    renderTab(c)
    await screen.findByText('My study')
    fireEvent.click(screen.getByRole('button', { name: 'Open My study as a continuous book' }))
    await waitFor(() => expect(useExternalBookStore.getState().chapters).toHaveLength(1))
    expect(useExternalBookStore.getState().chapters[0].html).toContain('Game two')
    fireEvent.click(screen.getByRole('button', { name: 'Open My study with one chapter per game' }))
    await waitFor(() => expect(useExternalBookStore.getState().chapters.map((x) => x.title)).toEqual(['Game one', 'Game two']))
    expect(within(document.body).queryByRole('alert')).toBeNull()
  })
})
