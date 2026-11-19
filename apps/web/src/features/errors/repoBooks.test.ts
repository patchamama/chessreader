import { afterEach, describe, expect, it, vi } from 'vitest'
import { useSettingsStore } from '../../shared/settings/settingsStore'
import { useExternalBookStore, EXTERNAL_BOOK_ID } from '../../shared/externalBook/externalBookStore'
import { loadBoardMemory } from '../library/store/boardMemory'
import { tinyEpub } from '../../shared/epub/tinyEpub.fixture'
import { clearRepoBookCache, loadRepoBookChapters, loadRepoBooks, openRepoBook, repoBookErrors, openRepoGame, textBookChapters } from './repoBooks'

const REPO = 'https://api.github.com/repos/me/chessreader-resources/contents'

describe('book errors from the private resources repository (deployed app with a GitHub token)', () => {
  afterEach(() => { vi.unstubAllGlobals(); clearRepoBookCache(); useSettingsStore.setState({ commentDbUrl: '', commentDbToken: '' }) })

  it('splits a book text into chapters at each form feed', () => {
    const { chapters } = textBookChapters('Intro\nSome words\fGame 1\n1. e4 e5 2. Nf3 Nc6\fGame 2\n1. d4 d5', 'Book')
    expect(chapters.map((c) => c.title)).toEqual(['Intro', 'Game 1', 'Game 2'])
    expect(chapters[1].html).toContain('<p>1. e4 e5 2. Nf3 Nc6</p>')
    expect(chapters[0].toc).toHaveLength(3)
  })

  it('lists the books of the manifest and recognises a book read from the repository with the token', async () => {
    useSettingsStore.setState({ commentDbUrl: REPO, commentDbToken: 'ghp_x' })
    const calls: { url: string; auth: string | undefined }[] = []
    vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
      calls.push({ url, auth: (init?.headers as Record<string, string> | undefined)?.Authorization })
      if (url.endsWith('books/manifest.json')) return new Response(JSON.stringify([{ id: 'tal', title: 'Al ataque', author: 'Tal', lang: 'es' }]))
      if (url.endsWith('.epub')) return new Response('Not Found', { status: 404 })
      return new Response('Tal\fTal – Smyslov\n1. e4 c6 2. d4 d5 3. Nc3 dxe4 4. Bb5 Nf6 5. Qh7\fOther\n1. d4 d5')
    }))
    const books = await loadRepoBooks()
    expect(books).toEqual([{ id: 'tal', title: 'Al ataque', author: 'Tal', lang: 'es' }])
    const { games, chapters } = await repoBookErrors(books[0])
    // No EPUB of the book: its text is read instead.
    expect(calls.slice(1).map((c) => c.url)).toEqual([`${REPO}/books/epub/tal.epub`, `${REPO}/books/text/tal.txt`])
    expect(calls.every((c) => c.auth === 'Bearer ghp_x')).toBe(true)
    expect(chapters).toHaveLength(3)
    expect(games.map((g) => [g.bookId, g.chapter, g.gameIndex])).toEqual([['tal', 2, 0], ['tal', 3, 0]])
    expect(games[0].errors.length).toBeGreaterThan(0)

    openRepoGame(books[0], chapters, games[0])
    expect(useExternalBookStore.getState().title).toBe('Al ataque')
    expect(useExternalBookStore.getState().chapters).toHaveLength(3)
    expect(loadBoardMemory(EXTERNAL_BOOK_ID)).toMatchObject({ chapter: 2, gameIndex: 0 })
  })

  it('opens a book from its EPUB: chapter titles, the book stylesheet and its images', async () => {
    useSettingsStore.setState({ commentDbUrl: REPO, commentDbToken: 'ghp_x' })
    const calls: { url: string; headers: Record<string, string> }[] = []
    vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
      calls.push({ url, headers: (init?.headers as Record<string, string>) ?? {} })
      if (url.endsWith('.epub')) return new Response(tinyEpub().slice().buffer)
      return new Response('Text\fShould not be read')
    }))
    await openRepoBook({ id: 'mi-sistema', title: 'Mi sistema' })
    expect(calls.map((c) => c.url)).toEqual([`${REPO}/books/epub/mi-sistema.epub`])
    // Large files of the contents API come only as raw content.
    expect(calls[0].headers).toMatchObject({ Accept: 'application/vnd.github.raw+json', Authorization: 'Bearer ghp_x' })
    const { title, chapters } = useExternalBookStore.getState()
    expect(title).toBe('Mi sistema')
    expect(chapters.map((c) => c.title)).toEqual(['Chapter 1', '5. El — cambio', '5. El — cambio (2)', 'Final'])
    expect(chapters[1].toc).toEqual([
      { order: 1, title: 'Chapter 1' }, { order: 2, title: '5. El — cambio' }, { order: 3, title: '5. El — cambio (2)' }, { order: 4, title: 'Final' },
    ])
    expect(chapters[1].html).toContain(':where(.epub-content) span.h3 {font-weight: bold; font-size: 130%}')
    expect(chapters[1].html).toMatch(/<img src="(?:blob:|data:image\/png;base64,)[^"]+" alt="Diagrama 1"/)
    expect(loadBoardMemory(EXTERNAL_BOOK_ID)).toMatchObject({ chapter: 1, gameIndex: 0 })

    // Read once per session.
    await loadRepoBookChapters({ id: 'mi-sistema', title: 'Mi sistema' })
    expect(calls).toHaveLength(1)
  })

  it('reads the text of the book when its EPUB cannot be parsed', async () => {
    useSettingsStore.setState({ commentDbUrl: REPO, commentDbToken: 'ghp_x' })
    vi.stubGlobal('fetch', vi.fn(async (url: string) => new Response(url.endsWith('.epub') ? 'not a zip' : 'Intro\fGame 1\n1. e4 e5')))
    const chapters = await loadRepoBookChapters({ id: 'b', title: 'B' })
    expect(chapters.map((c) => c.title)).toEqual(['Intro', 'Game 1'])
  })
})
