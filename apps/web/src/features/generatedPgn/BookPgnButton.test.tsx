import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import BookPgnButton from './BookPgnButton'
import type { GeneratedPgnClient } from './generatedPgnApi'
import type { ChapterLoader } from './bookGames'

const TEXTS: Record<number, string> = {
  1: 'Alpha Rook - Beta Knight 1950\n\n1. e4 e5 A calm start. 2. Nf3 1-0',
  2: 'Just prose.',
  3: 'Gamma - Delta\n\n1. d4 d5 2. c4 *',
}
const loadChapter: ChapterLoader = async (n) => ({ text: TEXTS[n] ?? '', title: `Ch ${n}`, toc: [{ order: 1, title: 'a' }, { order: 2, title: 'b' }, { order: 3, title: 'c' }] })
const fakeClient = (over: Partial<GeneratedPgnClient> = {}): GeneratedPgnClient => ({
  list: vi.fn(), get: vi.fn(), update: vi.fn(), remove: vi.fn(), uploadToLichess: vi.fn(),
  create: vi.fn(async (g) => ({ created: g.length, updated: 0, skipped: 0 })),
  ...over,
})
const setup = (props: Partial<React.ComponentProps<typeof BookPgnButton>> = {}) => {
  const save = vi.fn()
  const client = fakeClient()
  render(<BookPgnButton bookId={5} bookTitle="Invented Endings" author="A. Writer" chapter={1} loadChapter={loadChapter} client={client} save={save} {...props} />)
  fireEvent.click(screen.getByRole('button', { name: /Generate PGN from the games of this book/ }))
  return { save, client }
}
afterEach(cleanup)

describe('BookPgnButton', () => {
  it('downloads the games of this chapter as one PGN file with the book as source', async () => {
    const { save } = setup()
    fireEvent.click(screen.getByRole('button', { name: 'Download one PGN file' }))
    await waitFor(() => expect(save).toHaveBeenCalled())
    const [name, text, mime] = save.mock.calls[0]
    expect(name).toBe('Invented Endings-ch1.pgn')
    expect(mime).toBe('application/x-chess-pgn')
    expect(text).toContain('[White "Alpha Rook"]')
    expect(text).toContain('{A calm start.}')
    expect(text).toContain('[Source "Invented Endings, A. Writer, chapter 1: Ch 1"]')
    expect(await screen.findByText(/Downloaded 1 game in one PGN file/)).toBeInTheDocument()
  })

  it('downloads the whole book as one file per game in a zip', async () => {
    const { save } = setup()
    fireEvent.click(screen.getByLabelText('Whole book'))
    fireEvent.click(screen.getByRole('button', { name: 'Download one PGN per game (zip)' }))
    await waitFor(() => expect(save).toHaveBeenCalled())
    const [name, data, mime] = save.mock.calls[0]
    expect(name).toBe('Invented Endings-games.zip')
    expect(mime).toBe('application/zip')
    expect(data).toBeInstanceOf(Uint8Array)
    const names = new TextDecoder().decode(data)
    expect(names).toContain('ch01-game01 Alpha Rook - Beta Knight.pgn')
    expect(names).toContain('ch03-game01 Gamma - Delta.pgn')
    expect(await screen.findByText(/Downloaded 2 PGN files in a zip/)).toBeInTheDocument()
  })

  it('puts the games for review through the server', async () => {
    const { client } = setup({ chapters: [1, 2, 3] })
    fireEvent.click(screen.getByLabelText('Whole book'))
    fireEvent.click(screen.getByRole('button', { name: /Put for review/ }))
    expect(await screen.findByText(/Put 2 games for review/)).toBeInTheDocument()
    const games = vi.mocked(client.create).mock.calls[0][0]
    expect(games.map((g) => [g.bookId, g.chapter, g.gameIndex, g.white, g.result])).toEqual([[5, 1, 0, 'Alpha Rook', '1-0'], [5, 3, 0, 'Gamma', '*']])
    expect(games[0].pgn).toContain('1. e4 e5 {A calm start.}')
  })

  it('says so when no game is recognised, and shows a server error', async () => {
    setup({ chapter: 2 })
    fireEvent.click(screen.getByRole('button', { name: 'Download one PGN file' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('No games were recognised in this chapter')
    cleanup()
    const client = fakeClient({ create: vi.fn().mockRejectedValue(new Error('server down')) })
    setup({ client })
    fireEvent.click(screen.getByRole('button', { name: /Put for review/ }))
    expect(await screen.findByRole('alert')).toHaveTextContent('server down')
  })
})

describe('BookPgnButton in the library', () => {
  it('is a link that starts on the whole book', async () => {
    const save = vi.fn()
    render(<BookPgnButton bookId={5} bookTitle="Invented Endings" chapter={1} variant="link" loadChapter={loadChapter} client={fakeClient()} save={save} />)
    fireEvent.click(screen.getByRole('button', { name: /Generate PGN from the games of this book/ }))
    expect(screen.getByLabelText('Whole book')).toBeChecked()
    fireEvent.click(screen.getByRole('button', { name: 'Download one PGN file' }))
    await waitFor(() => expect(save).toHaveBeenCalled())
    expect(save.mock.calls[0][0]).toBe('Invented Endings.pgn')
    expect(save.mock.calls[0][1].match(/\[Event /g)).toHaveLength(2)
  })
})
