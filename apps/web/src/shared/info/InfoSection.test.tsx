import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { InfoSection } from './InfoSection'
import { themeInfo } from './themeInfo'
import { useSettingsStore } from '../settings/settingsStore'

const fetchMock = vi.fn()
beforeEach(() => {
  useSettingsStore.setState({ language: 'en' })
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
