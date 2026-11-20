import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

const env = vi.hoisted(() => ({
  demo: false,
  books: [] as { id: number; title: string }[],
  chapters: [] as string[],
  getJson: vi.fn(),
  http: vi.fn(),
  repoChapters: vi.fn(),
}))
const llm = vi.hoisted(() => ({ available: false, vision: false, config: null, complete: vi.fn() }))

vi.mock('../../shared/env/devMode', () => ({ isDemoHost: () => env.demo, isDevMode: () => false, isLocalhostHost: () => true }))
vi.mock('../database/resources', () => ({ hasResources: () => true }))
vi.mock('../library/api/libraryApi', () => ({ useBooks: () => ({ data: env.demo ? undefined : env.books }) }))
vi.mock('../library/commentdb/commentLookup', () => ({ getJson: env.getJson, getText: vi.fn(), resourcesApiUrl: vi.fn() }))
vi.mock('../../shared/api/httpClient', () => ({ httpClient: env.http }))
vi.mock('./repoBooks', async (orig) => ({ ...(await orig<typeof import('./repoBooks')>()), loadRepoBookChapters: env.repoChapters }))
vi.mock('../library/errata/errataSource', () => ({ saveErrata: vi.fn() }))
vi.mock('../suggestions/suggestionsApi', () => ({ saveSuggestion: vi.fn() }))
vi.mock('../../shared/llm', () => ({ useLlm: () => llm }))
vi.mock('./SuggestionsReview', () => ({ default: () => <p>Suggestions review stub</p> }))

import ErrorsPage from './ErrorsPage'
import { saveCachedErrors, summarise, type BookErrorSummary } from './errorsSummary'
import { saveErrata } from '../library/errata/errataSource'
import { saveSuggestion } from '../suggestions/suggestionsApi'
import { useBusyStore } from '../../shared/layout/busyStore'

// Synthetic games. "3. Bb4" is a misprint for "3. Bb5"; in MISSING Black's third move is missing.
const CORRUPTED = '<p>Smith – Jones, London 1985</p><p>1. e4 e5 2. Nf3 Nc6 3. Bb4 a6 4. Ba4 Nf6 5. O-O Be7</p>'
const MISSING = '<p>Brown – Green, Paris 1990</p><p>1. e4 e5 2. Nf3 Nc6 3. Bb5 4. Ba4 Nf6 5. O-O Be7</p>'
const CLEAN = '<p>White – Black, Rome 2000</p><p>1. d4 d5 2. c4 e6 3. Nc3 Nf6</p>'
const save = vi.mocked(saveErrata)
const saveSug = vi.mocked(saveSuggestion)

const serveChapters = () =>
  env.http.mockImplementation(async (path: string) => {
    const c = Number(path.split('/').pop())
    return { html: env.chapters[c - 1] ?? '', toc: env.chapters.map((_, i) => ({ order: i + 1, title: `Chapter ${i + 1}` })) }
  })

/** A remembered analysis, so the page does not analyse the book by itself. */
const remembered = (id: number, title: string, perGame: BookErrorSummary['perGame'] = []) =>
  saveCachedErrors({ ...summarise(id, title, []), games: 3, errors: perGame.reduce((s, g) => s + g.errors, 0) || 1, perGame })

const page = () => render(<MemoryRouter><ErrorsPage /></MemoryRouter>)
const bookRow = (title: string) => within(screen.getByRole('table', { name: 'Books with errors' })).getByRole('row', { name: new RegExp(title) })
const results = () => screen.findByRole('table', { name: 'Wrong moves found' })
const resultRow = async (label: RegExp) => within(await results()).getByRole('row', { name: label })

beforeEach(() => {
  vi.resetAllMocks()
  localStorage.clear()
  llm.available = false
  env.books = [{ id: 7, title: 'My System' }]
  env.chapters = [CORRUPTED, CLEAN, MISSING]
  serveChapters()
  remembered(7, 'My System')
})
afterEach(() => { env.demo = false; useBusyStore.setState({ tasks: [] }) })

describe('Errors page: find the wrong moves of a book (llm-assistant-round S10)', () => {
  it('lists, for each game with errors, the failing ply, the top fix, the later moves that play and a complete badge, without saving anything', async () => {
    page()
    fireEvent.click(within(bookRow('My System')).getByRole('button', { name: 'Find the wrong moves' }))
    const row = await resultRow(/Smith – Jones/)
    expect(row).toHaveTextContent('3. Bb4')
    expect(row).toHaveTextContent('3. Bb4 → Bb5 (substitute)')
    expect(row).toHaveTextContent('5 later moves play')
    expect(row).toHaveTextContent('complete')
    expect(within(await results()).queryByRole('row', { name: /White – Black/ })).toBeNull()
    expect(screen.getByTestId('wrong-moves-summary')).toHaveTextContent('2 games with errors checked · 2 with a wrong move · 2 with a complete fix')
    expect(env.http).toHaveBeenCalledWith('/api/library/books/7/chapters/3')
    expect(save).not.toHaveBeenCalled()
    expect(saveSug).not.toHaveBeenCalled()
  })

  it('previews how many moves are read before and after the fix', async () => {
    page()
    fireEvent.click(within(bookRow('My System')).getByRole('button', { name: 'Find the wrong moves' }))
    const row = await resultRow(/Smith – Jones/)
    fireEvent.click(within(row).getByRole('button', { name: 'Preview' }))
    expect(within(row).getByTestId('wrong-move-preview')).toHaveTextContent('4 → 10 of 10 moves read')
  })

  it('saves a substitution as an errata entry of the book and chapter (source engine)', async () => {
    save.mockResolvedValue({ saved: true, path: 'my-system/1-0.json' })
    page()
    fireEvent.click(within(bookRow('My System')).getByRole('button', { name: 'Find the wrong moves' }))
    const row = await resultRow(/Smith – Jones/)
    fireEvent.click(within(row).getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(row).toHaveTextContent('Saved: my-system/1-0.json'))
    const entry = save.mock.calls[0][0]
    expect(entry).toMatchObject({ book: { title: 'My System', id: 7 }, chapter: 1, gameIndex: 0 })
    expect(entry.changes).toEqual([expect.objectContaining({ ply: 5, from: 'Bb4', to: 'Bb5', source: 'engine' })])
    expect(saveSug).not.toHaveBeenCalled()
  })

  it('saves an insertion as a move suggestion with the main lines before and after', async () => {
    saveSug.mockResolvedValue({ saved: true, where: 'server', path: 'suggestions/move/my-system/x.json' })
    page()
    fireEvent.click(within(bookRow('My System')).getByRole('button', { name: 'Find the wrong moves' }))
    const row = await resultRow(/Brown – Green/)
    expect(row).toHaveTextContent('(insert)')
    fireEvent.click(within(row).getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(row).toHaveTextContent('Saved: suggestions/move/my-system/x.json'))
    const s = saveSug.mock.calls[0][0]
    expect(s).toMatchObject({ kind: 'move', target: { book: 'My System', chapter: 3, gameIndex: 0 }, status: 'pending' })
    expect((s.after as string[]).length).toBe((s.before as string[]).length + 1)
    expect(save).not.toHaveBeenCalled()
  })

  it('"Save all complete fixes" saves each complete fix once', async () => {
    save.mockResolvedValue({ saved: true, path: 'e.json' })
    saveSug.mockResolvedValue({ saved: true, where: 'server', path: 's.json' })
    page()
    fireEvent.click(within(bookRow('My System')).getByRole('button', { name: 'Find the wrong moves' }))
    await results()
    fireEvent.click(screen.getByRole('button', { name: 'Save all complete fixes' }))
    await waitFor(() => expect(within(screen.getByRole('table', { name: 'Wrong moves found' })).getAllByText(/^Saved:/)).toHaveLength(2))
    expect(save).toHaveBeenCalledTimes(1)
    expect(saveSug).toHaveBeenCalledTimes(1)
  })

  it('asks the AI to rank the fixes of a row and shows its pick without saving', async () => {
    llm.available = true
    llm.complete.mockResolvedValue({ text: '{"best": 1, "reason": "Matches the printed text."}', model: 'm' })
    page()
    fireEvent.click(within(bookRow('My System')).getByRole('button', { name: 'Find the wrong moves' }))
    const row = await resultRow(/Smith – Jones/)
    fireEvent.click(within(row).getByRole('button', { name: 'Ask the AI to rank' }))
    await waitFor(() => expect(within(row).getByTestId('wrong-move-ai')).toHaveTextContent('AI pick: 3. Bb4 → Bb5 (substitute). Matches the printed text.'))
    expect(llm.complete.mock.calls[0][0].messages[0].text).toContain('Bb4')
    expect(save).not.toHaveBeenCalled()
  })

  it('offers no AI ranking without a model', async () => {
    page()
    fireEvent.click(within(bookRow('My System')).getByRole('button', { name: 'Find the wrong moves' }))
    const row = await resultRow(/Smith – Jones/)
    expect(within(row).queryByRole('button', { name: 'Ask the AI to rank' })).toBeNull()
  })

  it('runs with a cancellable progress task and stops when cancelled', async () => {
    let release: () => void = () => {}
    env.http.mockImplementation((path: string) => new Promise((resolve) => {
      release = () => resolve({ html: CORRUPTED, toc: [1, 2, 3].map((order) => ({ order, title: `C${path}` })) })
    }))
    page()
    fireEvent.click(within(bookRow('My System')).getByRole('button', { name: 'Find the wrong moves' }))
    await waitFor(() => expect(useBusyStore.getState().tasks[0]?.cancel).toBeTypeOf('function'))
    expect(useBusyStore.getState().tasks[0].label).toMatch(/My System/)
    useBusyStore.getState().tasks[0].cancel!()
    release()
    expect(await screen.findByText(/Stopped/)).toBeInTheDocument()
    expect(env.http).toHaveBeenCalledTimes(1)
    await waitFor(() => expect(useBusyStore.getState().tasks).toHaveLength(0))
  })
})

describe('Errors page: find the wrong moves of the games with most errors', () => {
  it('loads only the chapters of the listed games', async () => {
    remembered(7, 'My System', [{ chapter: 3, gameIndex: 0, label: 'Brown – Green', moves: 5, errors: 2, messages: [] }])
    page()
    fireEvent.click(screen.getByRole('button', { name: 'Find the wrong moves in these games' }))
    await resultRow(/Brown – Green/)
    expect(env.http.mock.calls.map((c) => c[0])).toEqual(['/api/library/books/7/chapters/3'])
    expect(within(await results()).queryByRole('row', { name: /Smith – Jones/ })).toBeNull()
  })
})

describe('Errors page: find the wrong moves of a resources book (deployed app)', () => {
  it('reads the repository book and files the errata under the reader chapter', async () => {
    env.demo = true
    env.getJson.mockImplementation(async (path: string) => {
      if (path === 'books/manifest.json') return [{ id: 'smith', title: 'Smith Games', author: null, lang: 'en' }]
      throw new Error('404')
    })
    // The EPUB starts with a cover without text: text chapter 1 is the book's chapter 2.
    env.repoChapters.mockResolvedValue([{ title: 'Cover', html: '<img src="c.png">', toc: [] }, { title: 'One', html: CORRUPTED, toc: [] }])
    save.mockResolvedValue({ saved: true, path: 'smith-games/2-0.json' })
    page()
    await waitFor(() => expect(bookRow('Smith Games')).toBeInTheDocument())
    fireEvent.click(within(bookRow('Smith Games')).getByRole('button', { name: 'Find the wrong moves' }))
    const row = await resultRow(/Smith – Jones/)
    fireEvent.click(within(row).getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(save).toHaveBeenCalled())
    expect(save.mock.calls[0][0]).toMatchObject({ book: { title: 'Smith Games' }, chapter: 2, gameIndex: 0 })
    expect(env.http).not.toHaveBeenCalled()
  })
})
