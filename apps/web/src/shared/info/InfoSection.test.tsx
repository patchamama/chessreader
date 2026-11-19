import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { Chess } from 'chess.js'
import { InfoSection } from './InfoSection'
import { themeInfo } from './themeInfo'
import { useSettingsStore } from '../settings/settingsStore'

const fetchMock = vi.fn()
beforeEach(() => {
  useSettingsStore.setState({ language: 'en', notationStyle: 'letters', diagramEvalThumbs: false })
  fetchMock.mockReset()
  vi.stubGlobal('fetch', fetchMock)
})
afterEach(() => vi.unstubAllGlobals())

const open = (name: RegExp) => fireEvent.click(screen.getByText(name))

describe('InfoSection (S6)', () => {
  it('explains the patterns in the language chosen, with links to learn more', () => {
    useSettingsStore.setState({ language: 'es' })
    render(<InfoSection topic="puzzle" themes={['fork', 'backRankMate']} />)
    open(/Sobre este ejercicio/)
    expect(screen.getByText('Ataque doble')).toBeInTheDocument()
    expect(screen.getByText(/ataca dos o más piezas/)).toBeInTheDocument()
    expect(screen.getByText('Mate del pasillo')).toBeInTheDocument()
    const links = screen.getAllByRole('link').map((a) => a.getAttribute('href'))
    expect(links).toContain('https://lichess.org/training/fork')
    expect(links.some((h) => h?.startsWith('https://es.wikipedia.org/'))).toBe(true)
  })

  it('knows a pattern by its Lichess key or by its name, in German too', () => {
    useSettingsStore.setState({ language: 'de' })
    render(<InfoSection topic="pattern" themes={['Pin']} />)
    open(/Über dieses Motiv/)
    expect(screen.getByText('Fesselung')).toBeInTheDocument()
    expect(themeInfo('pin', 'de')?.name).toBe('Fesselung')
  })

  it('asks Wikipedia about the opening only when opened, in the language chosen', async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ extract: 'The Italian Game is a chess opening.', content_urls: { desktop: { page: 'https://en.wikipedia.org/wiki/Italian_Game' } } }), { status: 200 }))
    render(<InfoSection topic="trap" opening="Italian Game" idea="f7 is weak." />)
    expect(fetchMock).not.toHaveBeenCalled()
    open(/About this trap/)
    expect(screen.getByText('f7 is weak.')).toBeInTheDocument()
    await waitFor(() => expect(screen.getByText('The Italian Game is a chess opening.')).toBeInTheDocument())
    expect(String(fetchMock.mock.calls[0][0])).toBe('https://en.wikipedia.org/api/rest_v1/page/summary/Italian_Game')
  })

  it('when Wikipedia cannot be reached, shows only the link', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'))
    render(<InfoSection topic="ideas" opening="Italian Game" />)
    open(/About these ideas/)
    await waitFor(() => expect(fetchMock).toHaveBeenCalled())
    expect(screen.getByRole('link', { name: /Italian Game/ })).toHaveAttribute('href', expect.stringContaining('en.wikipedia.org'))
    expect(screen.queryByRole('alert')).toBeNull()
  })
})

const summary = (extract: string) => fetchMock.mockResolvedValue(new Response(JSON.stringify({ extract, content_urls: { desktop: { page: 'https://x.wikipedia.org/wiki/X' } } }), { status: 200 }))
const START = new Chess().fen()

describe('InfoSection: moves in its text play on the board (S19)', () => {
  it('parses the moves of the Wikipedia summary; each one is clickable and shows its position', async () => {
    summary('The Italian Game is a chess opening beginning with the moves:1. e4 e5 2. Nf3 Nc6 3. Bc4')
    const onShowLine = vi.fn()
    render(<InfoSection topic="trap" opening="Italian Game" onShowLine={onShowLine} />)
    open(/About this trap/)
    const info = screen.getByTestId('info-section')
    await waitFor(() => expect(within(info).getByRole('button', { name: 'Bc4' })).toBeInTheDocument())
    expect(within(info).getByText(/The Italian Game is a chess opening beginning with the moves:/)).toBeInTheDocument()
    fireEvent.click(within(info).getByRole('button', { name: 'Nf3' }))
    expect(onShowLine).toHaveBeenCalledWith(START, ['e4', 'e5', 'Nf3', 'Nc6', 'Bc4'], 3)
  })

  it('reads Spanish letters and figurines, and writes the moves in the notation of the settings', async () => {
    useSettingsStore.setState({ language: 'es' })
    summary('La apertura italiana: 1.e4 e5 2.Cf3 Cc6 3.Ac4; también 1. e4 e5 2. ♘f3.')
    const onShowLine = vi.fn()
    render(<InfoSection topic="trap" opening="Apertura italiana" onShowLine={onShowLine} />)
    open(/Sobre esta celada/)
    const info = screen.getByTestId('info-section')
    await waitFor(() => expect(within(info).getByRole('button', { name: 'Ac4' })).toBeInTheDocument())
    fireEvent.click(within(info).getByRole('button', { name: 'Ac4' }))
    expect(onShowLine).toHaveBeenLastCalledWith(START, ['e4', 'e5', 'Nf3', 'Nc6', 'Bc4'], 5)
    fireEvent.click(within(info).getAllByRole('button', { name: 'Cf3' })[1])
    expect(onShowLine).toHaveBeenLastCalledWith(START, ['e4', 'e5', 'Nf3'], 3)
  })

  it('parses the idea text too, from the positions given (the trap line)', () => {
    const c = new Chess(); c.move('e4'); c.move('e5')
    const onShowLine = vi.fn()
    render(<InfoSection topic="trap" idea="Then 2. Bc4 aims at f7." lineFens={[START, new Chess('rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1').fen(), c.fen()]} onShowLine={onShowLine} />)
    open(/About this trap/)
    fireEvent.click(screen.getByRole('button', { name: 'Bc4' }))
    expect(onShowLine).toHaveBeenCalledWith(c.fen(), ['Bc4'], 1)
  })

  it('text that is not a legal move stays plain, and without a board the moves are only text', async () => {
    summary('After 1. e4 the reply Bc5 is not legal; 1. e4 e5 is classical.')
    render(<InfoSection topic="trap" opening="Italian Game" idea="f7 is weak." />)
    open(/About this trap/)
    await waitFor(() => expect(screen.getByText(/is classical/)).toBeInTheDocument())
    expect(screen.queryAllByRole('button')).toHaveLength(0)
    expect(screen.getByTestId('info-section')).toHaveTextContent('After 1. e4 the reply Bc5 is not legal; 1. e4 e5 is classical.')
  })

  it('an illegal move next to legal ones is not made clickable', async () => {
    summary('Never 1. e4 e5 2. Bc5 here.')
    render(<InfoSection topic="trap" opening="Italian Game" onShowLine={vi.fn()} />)
    open(/About this trap/)
    await waitFor(() => expect(screen.getByText(/here\./)).toBeInTheDocument())
    expect(screen.queryByRole('button', { name: 'Bc5' })).toBeNull()
  })
})
