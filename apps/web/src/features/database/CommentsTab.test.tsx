import { beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import type { CommentEntry } from '../comments/commentsApi'

const llm = vi.hoisted(() => ({ available: false, vision: false, config: null as unknown, complete: vi.fn() }))
vi.mock('../../shared/llm', () => ({ useLlm: () => llm }))
const api = vi.hoisted(() => ({ loadCommentPage: vi.fn(), loadCommentSources: vi.fn(), loadCommentGame: vi.fn(), deleteComment: vi.fn() }))
vi.mock('../comments/commentsApi', async (orig) => ({ ...(await orig<typeof import('../comments/commentsApi')>()), ...api }))
const save = vi.hoisted(() => vi.fn())
vi.mock('../suggestions/suggestionsApi', () => ({ saveSuggestion: save }))
const inBook = vi.hoisted(() => ({ openGameInBook: vi.fn() }))
vi.mock('./openInBook', () => inBook)

import CommentsTab from './CommentsTab'
import { useExternalBookStore } from '../../shared/externalBook/externalBookStore'
import { useBusyStore } from '../../shared/layout/busyStore'

const FEN = 'r1bqkb1r/pppp1ppp/1n6/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 0 1'
const book = { id: 1, title: 'Invented Book', author: 'A. Writer', kind: 'book', lang: 'en', book: 'invented-book' }
const study = { id: 2, title: 'Lichess studies', author: null, kind: 'lichess', lang: 'en', book: null }
const entry = (id: number, text: string, over: Partial<CommentEntry> = {}): CommentEntry => ({
  id, hash: '0123456789abcdef', fen: FEN, text, lang: 'en', ply: 24, move: 12, san: 'Nb6', gameId: '1-4', chapter: 3, source: book,
  game: { white: 'White Player', black: 'Black Player', label: null }, ...over,
})
const rows = [entry(7, 'After 12...Nb6 Smith keeps c4.'), entry(8, 'A study remark.', { source: study, gameId: '2-1', chapter: null, ply: 15, move: 8, san: 'Nc3' })]

const show = () => render(
  <MemoryRouter initialEntries={['/database']}>
    <Routes>
      <Route path="/database" element={<CommentsTab books={[]} />} />
      <Route path="/read/:id" element={<p>reader</p>} />
    </Routes>
  </MemoryRouter>,
)
const row = (id: number) => screen.findByRole('listitem', { name: `Comment ${id}` })

beforeEach(() => {
  cleanup()
  llm.available = false
  llm.complete.mockReset()
  save.mockReset()
  save.mockResolvedValue({ saved: true, where: 'server', path: 'p' })
  api.loadCommentPage.mockReset()
  api.loadCommentPage.mockResolvedValue({ total: 2, comments: rows })
  api.loadCommentSources.mockResolvedValue([{ ...book, comments: 1 }, { ...study, comments: 1 }])
  api.loadCommentGame.mockReset()
  api.deleteComment.mockReset()
  inBook.openGameInBook.mockReset()
  useBusyStore.setState({ tasks: [] })
})

describe('Database → Comments (S2)', () => {
  it('shows each comment with its position thumbnail, source, author, move, chapter and ids', async () => {
    show()
    const r = within(await row(7))
    expect(r.getByRole('img', { name: 'Position after 12...Nb6' }).getAttribute('src')).toMatch(/^data:image\/svg\+xml/)
    expect(r.getByRole('img', { name: 'Position after 12...Nb6' }).getAttribute('loading')).toBe('lazy')
    expect(r.getByText('After 12...Nb6 Smith keeps c4.')).toBeTruthy()
    expect((await row(7)).textContent).toMatch(/Invented Book.*A\. Writer/)
    expect((await row(7)).textContent).toContain('Chapter 3')
    expect(r.getByRole('button', { name: 'Copy comment id 7' }).textContent).toContain('7')
    expect(r.getByRole('button', { name: 'Copy game id 1-4' }).textContent).toContain('1-4')
    expect((await row(7)).textContent).toContain('White Player – Black Player')
    expect((await row(8)).textContent).toContain('8. Nc3')
    expect(screen.getByText('1–2 of 2')).toBeTruthy()
  })

  it('filters by text, source, language and books/Lichess', async () => {
    show()
    await row(7)
    fireEvent.change(screen.getByRole('searchbox', { name: 'Search comments' }), { target: { value: 'c4' } })
    await waitFor(() => expect(api.loadCommentPage).toHaveBeenLastCalledWith(expect.objectContaining({ q: 'c4' }), 0, 50))
    fireEvent.change(await screen.findByRole('combobox', { name: 'Source' }), { target: { value: '2' } })
    await waitFor(() => expect(api.loadCommentPage).toHaveBeenLastCalledWith(expect.objectContaining({ source: 2 }), 0, 50))
    fireEvent.change(screen.getByRole('combobox', { name: 'Language' }), { target: { value: 'es' } })
    fireEvent.change(screen.getByRole('combobox', { name: 'Origin' }), { target: { value: 'lichess' } })
    await waitFor(() => expect(api.loadCommentPage).toHaveBeenLastCalledWith({ q: 'c4', source: 2, lang: 'es', kind: 'lichess' }, 0, 50))
  })

  it('pages through the comments', async () => {
    api.loadCommentPage.mockResolvedValue({ total: 120, comments: rows })
    show()
    fireEvent.click(await screen.findByRole('button', { name: 'Next page' }))
    await waitFor(() => expect(api.loadCommentPage).toHaveBeenLastCalledWith(expect.anything(), 50, 50))
  })

  it('opens the game of a comment as the browser book', async () => {
    api.loadCommentGame.mockResolvedValue({ id: '1-4', white: 'White Player', black: 'Black Player', pgn: '1. e4 {Good.} e5 2. Nf3 Nc6 *' })
    show()
    fireEvent.click(within(await row(7)).getByRole('button', { name: 'Open the game' }))
    await screen.findByText('reader')
    expect(api.loadCommentGame).toHaveBeenCalledWith('1-4')
    expect(useExternalBookStore.getState().title).toBe('White Player – Black Player')
    expect(useExternalBookStore.getState().chapters.length).toBeGreaterThan(0)
  })

  it('opens a book comment in its book at its chapter; disabled without a chapter or a book', async () => {
    inBook.openGameInBook.mockResolvedValue('/read/42')
    show()
    fireEvent.click(within(await row(7)).getByRole('button', { name: 'Open in the book' }))
    await screen.findByText('reader')
    expect(inBook.openGameInBook).toHaveBeenCalledWith({ id: 'invented-book', title: 'Invented Book', author: 'A. Writer', lang: 'en' }, { chapter: 3, gameIndex: null })
    cleanup()
    show()
    expect(within(await row(8)).getByRole('button', { name: 'Open in the book' })).toHaveProperty('disabled', true)
  })

  it('offers no AI actions without a model', async () => {
    show()
    await row(7)
    expect(screen.queryByRole('button', { name: 'Make universal' })).toBeNull()
    expect(screen.queryByRole('checkbox', { name: 'Select comment 7' })).toBeNull()
  })
})

describe('Database → Comments with the AI (S3)', () => {
  beforeEach(() => { llm.available = true })

  it('Make universal: Test shows the original and the proposal side by side, Save stores a suggestion', async () => {
    llm.complete.mockResolvedValue({ text: '{"text":"After 12...Nb6 White keeps c4."}', model: 'test-model' })
    show()
    fireEvent.click(within(await row(7)).getByRole('button', { name: 'Make universal' }))
    const panel = await screen.findByRole('region', { name: 'Proposal for comment 7' })
    expect(within(panel).getByText('After 12...Nb6 Smith keeps c4.')).toBeTruthy()
    expect(within(panel).getByText('After 12...Nb6 White keeps c4.')).toBeTruthy()
    fireEvent.click(within(panel).getByRole('button', { name: 'Save' }))
    await within(panel).findByText(/Saved to the server/)
    expect(save.mock.calls[0][0]).toMatchObject({ kind: 'comment', target: { book: 'Invented Book', commentId: 7, chapter: 3 }, author: 'ai', model: 'test-model' })
  })

  it('Translate to…: a flagged proposal shows its problems', async () => {
    llm.complete.mockResolvedValue({ text: '{"text":"Smith mantiene c4."}', model: 'm' })
    show()
    const r = within(await row(7))
    fireEvent.change(r.getByRole('combobox', { name: 'Translate to' }), { target: { value: 'es' } })
    fireEvent.click(r.getByRole('button', { name: 'Translate' }))
    const panel = await screen.findByRole('region', { name: 'Proposal for comment 7' })
    expect(within(panel).getByRole('alert').textContent).toContain('moves missing from the proposal: Nb6')
    expect(llm.complete.mock.calls[0][0].system).toMatch(/Spanish/)
  })

  it('a proposal that cannot be stored is offered as a download', async () => {
    llm.complete.mockResolvedValue({ text: '{"text":"After 12...Nb6 White keeps c4."}', model: 'm' })
    save.mockResolvedValue({ saved: false, path: 'suggestions/comment/x/y.json', json: '{"id":"y"}' })
    show()
    fireEvent.click(within(await row(7)).getByRole('button', { name: 'Make universal' }))
    const panel = await screen.findByRole('region', { name: 'Proposal for comment 7' })
    fireEvent.click(within(panel).getByRole('button', { name: 'Save' }))
    expect((await within(panel).findByRole('link', { name: /Download/ })).getAttribute('download')).toBe('y.json')
  })

  it('Translate the game: the translated PGN is shown and saved as a game suggestion', async () => {
    api.loadCommentGame.mockResolvedValue({ id: '1-4', white: 'W', black: 'B', pgn: '1. e4 {A sharp start.} e5 *' })
    llm.complete.mockResolvedValue({ text: '{"comments":["Un comienzo agudo."]}', model: 'm' })
    show()
    const r = within(await row(7))
    fireEvent.change(r.getByRole('combobox', { name: 'Translate to' }), { target: { value: 'es' } })
    fireEvent.click(r.getByRole('button', { name: 'Translate the game' }))
    const panel = await screen.findByRole('region', { name: 'Proposal for comment 7' })
    expect(within(panel).getByText('1. e4 {Un comienzo agudo.} e5 *')).toBeTruthy()
    fireEvent.click(within(panel).getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(save.mock.calls[0][0]).toMatchObject({ kind: 'game', after: { pgn: '1. e4 {Un comienzo agudo.} e5 *' } }))
  })

  it('Batch: select the page, run an action with the footer progress and show the counts', async () => {
    llm.complete
      .mockResolvedValueOnce({ text: '{"text":"After 12...Nb6 White keeps c4."}', model: 'm' })
      .mockResolvedValueOnce({ text: '{"text":"A remark."}', model: 'm' })
    show()
    await row(7)
    fireEvent.click(screen.getByRole('checkbox', { name: 'Select the page' }))
    expect(screen.getByRole('checkbox', { name: 'Select comment 8' })).toHaveProperty('checked', true)
    fireEvent.change(screen.getByRole('combobox', { name: 'Batch action' }), { target: { value: 'translate:de' } })
    fireEvent.click(screen.getByRole('button', { name: 'Run on 2 selected' }))
    expect(await screen.findByText('2 saved · 0 flagged · 0 failed')).toBeTruthy()
    expect(save).toHaveBeenCalledTimes(2)
    expect(save.mock.calls[0][0]).toMatchObject({ kind: 'translation', after: { lang: 'de' } })
  })

  it('Details opens the comment modal and Cancel closes it (S3)', async () => {
    show()
    fireEvent.click(within(await row(7)).getByRole('button', { name: 'Details' }))
    const d = await screen.findByRole('dialog', { name: 'Comment 7 details' })
    expect(within(d).getByText('0123456789abcdef')).toBeTruthy()
    fireEvent.click(within(d).getByRole('button', { name: 'Cancel' }))
    expect(screen.queryByRole('dialog')).toBeNull()
  })
})

describe('Deleting comments (S17)', () => {
  it('deletes a comment of the list after confirming, and removes it', async () => {
    api.deleteComment.mockResolvedValue(undefined)
    show()
    const r = await row(7)
    fireEvent.click(within(r).getByRole('button', { name: 'Delete' }))
    expect(api.deleteComment).not.toHaveBeenCalled()
    fireEvent.click(within(r).getByRole('button', { name: 'Yes, delete' }))
    await waitFor(() => expect(api.deleteComment).toHaveBeenCalledWith(7))
    expect(await screen.findByText(/Comment 7 deleted/)).toBeTruthy()
    expect(screen.queryByRole('listitem', { name: 'Comment 7' })).toBeNull()
  })
  it('shows the error inline when the database is read-only', async () => {
    api.deleteComment.mockRejectedValue(new Error('read-only'))
    show()
    const r = await row(8)
    fireEvent.click(within(r).getByRole('button', { name: 'Delete' }))
    fireEvent.click(within(r).getByRole('button', { name: 'Yes, delete' }))
    expect(await within(r).findByText('read-only')).toBeTruthy()
    expect(screen.getByRole('listitem', { name: 'Comment 8' })).toBeTruthy()
  })
})
