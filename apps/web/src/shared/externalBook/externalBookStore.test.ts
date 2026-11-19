import { describe, it, expect, beforeEach, vi } from 'vitest'
import { ensureExternalChapters, registerExternalSourceLoader, useExternalBookStore } from './externalBookStore'

// reader-analysis-round S2: a resources book opened from its EPUB holds images as
// object URLs, which die with the page: it is kept by its source and read again.

const CH = [{ title: 'One', html: '<img src="blob:x">', toc: [{ order: 1, title: 'One' }] }]

beforeEach(() => {
  localStorage.clear()
  useExternalBookStore.setState({ title: '', chapters: [], source: null, version: 0 })
})

describe('external book kept across a refresh', () => {
  it('keeps a pasted book whole in the browser', () => {
    useExternalBookStore.getState().open('Pasted', CH)
    const saved = JSON.parse(localStorage.getItem('chessreader-external-book') ?? '{}')
    expect(saved.state.chapters).toHaveLength(1)
  })

  it('keeps a resources book by its source only, not its chapters', () => {
    useExternalBookStore.getState().open('Mi sistema', CH, { kind: 'repo', id: 'mi-sistema' })
    const saved = JSON.parse(localStorage.getItem('chessreader-external-book') ?? '{}')
    expect(saved.state.chapters).toEqual([])
    expect(saved.state.source).toEqual({ kind: 'repo', id: 'mi-sistema' })
  })

  it('reads a book kept by its source again when its chapters are asked for', async () => {
    const loader = vi.fn().mockResolvedValue(CH)
    registerExternalSourceLoader('repo', loader)
    useExternalBookStore.setState({ title: 'Mi sistema', chapters: [], source: { kind: 'repo', id: 'mi-sistema' } })
    await expect(ensureExternalChapters()).resolves.toEqual(CH)
    expect(loader).toHaveBeenCalledWith({ kind: 'repo', id: 'mi-sistema' }, 'Mi sistema')
    expect(useExternalBookStore.getState().chapters).toEqual(CH)
    await ensureExternalChapters()
    expect(loader).toHaveBeenCalledTimes(1)
  })
})
