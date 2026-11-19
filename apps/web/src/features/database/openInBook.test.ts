import { beforeEach, describe, expect, it, vi } from 'vitest'

const env = vi.hoisted(() => ({
  demo: false,
  httpClient: vi.fn(),
  loadRepoBookChapters: vi.fn(),
  openRepoGame: vi.fn(),
  saveProgress: vi.fn(),
  saveBoardMemory: vi.fn(),
}))
vi.mock('../../shared/env/devMode', () => ({ isDemoHost: () => env.demo, isDevMode: () => false, isLocalhostHost: () => true }))
vi.mock('../../shared/api/httpClient', () => ({ httpClient: env.httpClient }))
vi.mock('../errors/repoBooks', () => ({ loadRepoBookChapters: env.loadRepoBookChapters, openRepoGame: env.openRepoGame }))
vi.mock('../library/store/readingStore', () => ({ saveProgress: env.saveProgress }))
vi.mock('../library/store/boardMemory', () => ({ saveBoardMemory: env.saveBoardMemory }))

import { openGameInBook } from './openInBook'
import { useAuthStore } from '../auth/store/authStore'
import { EXTERNAL_BOOK_ID } from '../../shared/externalBook/externalBookStore'
import { isVisited, resetVisited } from '../../shared/visited/visitedStore'

const book = { id: 'mis-geniales-predecesores-iii', title: 'Mis geniales predecesores III', author: 'Garry Kasparov', lang: 'es' }

describe('openGameInBook (S2: open the book at the chapter and game of a database game)', () => {
  beforeEach(() => {
    for (const f of [env.httpClient, env.loadRepoBookChapters, env.openRepoGame, env.saveProgress, env.saveBoardMemory]) f.mockReset()
    env.demo = false
    useAuthStore.setState({ token: null })
  })

  it('server: a library book with the same title opens at that chapter and game', async () => {
    useAuthStore.setState({ token: 't' })
    env.httpClient.mockResolvedValue([{ id: 3, title: 'Otro libro' }, { id: 7, title: '  mis geniales predecesores iii ' }])
    expect(await openGameInBook(book, { chapter: 4, gameIndex: 2 })).toBe('/read/7')
    expect(env.httpClient).toHaveBeenCalledWith('/api/library/books')
    expect(env.saveProgress).toHaveBeenCalledWith(7, 4)
    expect(env.saveBoardMemory).toHaveBeenCalledWith(7, { chapter: 4, gameIndex: 2, nodeId: null, annotations: {} })
    expect(env.openRepoGame).not.toHaveBeenCalled()
  })

  it('deployed app (or no library book with that title): the text of the resources, at that chapter and game', async () => {
    env.demo = true
    const chapters = [{ title: 'c1', html: '<p>x</p>', toc: [] }]
    env.loadRepoBookChapters.mockResolvedValue(chapters)
    expect(await openGameInBook(book, { chapter: 4, gameIndex: 2 })).toBe(`/read/${EXTERNAL_BOOK_ID}`)
    expect(env.httpClient).not.toHaveBeenCalled()
    expect(env.loadRepoBookChapters).toHaveBeenCalledWith(book)
    expect(env.openRepoGame).toHaveBeenCalledWith(book, chapters, { chapter: 4, gameIndex: 2 })

    env.demo = false
    useAuthStore.setState({ token: 't' })
    env.httpClient.mockResolvedValue([{ id: 3, title: 'Otro libro' }])
    expect(await openGameInBook(book, { chapter: 5, gameIndex: null })).toBe(`/read/${EXTERNAL_BOOK_ID}`)
    expect(env.openRepoGame).toHaveBeenLastCalledWith(book, chapters, { chapter: 5, gameIndex: 0 })
  })

  it('S9: the library book opened at the game is marked as opened', async () => {
    resetVisited()
    useAuthStore.setState({ token: 't' })
    env.httpClient.mockResolvedValue([{ id: 7, title: 'Mis geniales predecesores III' }])
    await openGameInBook(book, { chapter: 4, gameIndex: 2 })
    expect(isVisited('serverBook', 7)).toBe(true)
  })

  it('S8: a library book whose title adds a subtitle to the resources title is the same book', async () => {
    useAuthStore.setState({ token: 't' })
    const first = { ...book, id: 'mgp-i', title: 'Mis geniales predecesores I' }
    env.httpClient.mockResolvedValue([
      { id: 7, title: 'Mis geniales predecesores II. De Euwe A Tal' },
      { id: 6, title: 'Mis geniales predecesores I. De Steinitz a Alekhine' },
    ])
    expect(await openGameInBook(first, { chapter: 4, gameIndex: 6 })).toBe('/read/6')
    expect(env.openRepoGame).not.toHaveBeenCalled()
  })
})
