import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { APP_VERSION } from '../../version'
import type { GameErrors } from './bookErrors'
import type { ErrorsFile } from './errorsSummary'

const env = vi.hoisted(() => ({ demo: false, books: [] as { id: number | string; title: string }[], getJson: vi.fn(), bookErrors: vi.fn() }))

vi.mock('../../shared/env/devMode', () => ({ isDemoHost: () => env.demo, isDevMode: () => false, isLocalhostHost: () => true }))
vi.mock('../database/resources', () => ({ hasResources: () => true }))
vi.mock('../library/api/libraryApi', () => ({ useBooks: () => ({ data: env.demo ? undefined : env.books }) }))
vi.mock('../library/commentdb/commentLookup', () => ({ getJson: env.getJson, getText: vi.fn() }))
vi.mock('./bookErrors', async (orig) => ({ ...(await orig<typeof import('./bookErrors')>()), bookErrors: env.bookErrors }))

import ErrorsPage from './ErrorsPage'

const game = (bookId: number | string, chapter: number, n: number): GameErrors => ({
  bookId, chapter, gameIndex: 0, label: `game ${chapter}`, moves: 30,
  errors: Array.from({ length: n }, () => ({ kind: 'wrong-move' as const, san: 'Qx9', message: 'Jugada ilegal' })),
})

const page = () => render(<MemoryRouter><ErrorsPage /></MemoryRouter>)
const row = (title: string) => within(screen.getByRole('table', { name: 'Books with errors' })).getByRole('row', { name: new RegExp(title) })

describe('errors page filled from the start (S17)', () => {
  beforeEach(() => { localStorage.clear(); env.getJson.mockReset(); env.bookErrors.mockReset() })
  afterEach(() => { env.demo = false; env.books = [] })

  it('deployed app: fills the table and the ranking from errors.json of the resources repository without analysing', async () => {
    env.demo = true
    const file: ErrorsFile = {
      generatedAt: '2026-11-18T10:00:00.000Z', version: '0.96.0',
      books: [{ id: 'kasp-3', title: 'Kasparov III', games: 124, errors: 690, byKind: { illegal: 600, ambiguous: 90 }, analysedAt: '2026-11-18T10:00:00.000Z',
        perGame: [{ chapter: 5, gameIndex: 2, label: 'Tal – Botvinnik · e4 c6', moves: 41, errors: 17, messages: ['Jugada ilegal'] }] }],
    }
    env.getJson.mockImplementation(async (path: string) => path === 'books/manifest.json'
      ? [{ id: 'kasp-3', title: 'Kasparov III', author: 'Kasparov', lang: 'es' }]
      : file)
    page()
    await waitFor(() => expect(within(row('Kasparov III')).getByText('690')).toBeInTheDocument())
    const cells = within(row('Kasparov III')).getAllByRole('cell').map((c) => c.textContent)
    expect(cells).toEqual(expect.arrayContaining(['124', '690', '5.56', 'illegal 600, ambiguous 90']))
    expect(env.getJson).toHaveBeenCalledWith('books/errors.json')
    const ranking = screen.getByRole('table', { name: 'Games with most errors' })
    expect(within(ranking).getByText('Tal – Botvinnik · e4 c6')).toBeInTheDocument()
    expect(within(ranking).getByText('17')).toBeInTheDocument()
    expect(env.bookErrors).not.toHaveBeenCalled()
  })

  it('library: shows the remembered results of the last analysis at once, without analysing again', async () => {
    env.books = [{ id: 7, title: 'My System' }]
    const { summarise, saveCachedErrors } = await import('./errorsSummary')
    saveCachedErrors(summarise(7, 'My System', [game(7, 1, 3), game(7, 2, 1)], '2026-11-17T09:00:00.000Z'))
    page()
    const cells = within(row('My System')).getAllByRole('cell').map((c) => c.textContent)
    expect(cells).toEqual(expect.arrayContaining(['2', '4', '2.00', 'wrong-move 4']))
    expect(localStorage.getItem(`errors:${APP_VERSION}:7`)).not.toBeNull()
    expect(env.bookErrors).not.toHaveBeenCalled()
  })

  it('library: analyses in the background, one at a time, the books never analysed, and remembers the results', async () => {
    env.books = [{ id: 7, title: 'My System' }, { id: 8, title: 'Zurich 1953' }]
    const { summarise, saveCachedErrors } = await import('./errorsSummary')
    saveCachedErrors(summarise(7, 'My System', [game(7, 1, 3)], '2026-11-17T09:00:00.000Z'))
    env.bookErrors.mockImplementation(async (id: number) => [game(id, 1, 5), game(id, 2, 0)])
    page()
    await waitFor(() => expect(within(row('Zurich 1953')).getAllByRole('cell').map((c) => c.textContent)).toEqual(expect.arrayContaining(['2', '5', '2.50'])))
    expect(env.bookErrors).toHaveBeenCalledTimes(1)
    expect(env.bookErrors.mock.calls[0][0]).toBe(8)
    expect(JSON.parse(localStorage.getItem(`errors:${APP_VERSION}:8`) ?? 'null')).toMatchObject({ id: 8, games: 2, errors: 5 })
  })
})
