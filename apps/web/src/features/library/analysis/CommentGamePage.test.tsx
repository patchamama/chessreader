import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import CommentGamePage from './CommentGamePage'
import { useBusyStore } from '../../../shared/layout/busyStore'
import { useSettingsStore } from '../../../shared/settings/settingsStore'
import { useAuthStore } from '../../auth/store/authStore'

// These tests run without a server (jsdom's host is localhost, where the app would ask it).
vi.mock('../../../shared/api/serverSession', () => ({ hasServerSession: () => false }))


const getJson = vi.fn()
vi.mock('../commentdb/commentLookup', () => ({ getJson: (path: string) => getJson(path) }))
vi.mock('../../../shared/chess/ChessBoard', () => ({
  default: ({ fen }: { fen: string }) => <div data-testid="board">{fen}</div>,
}))

const AFTER_E5 = 'rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2'

const renderAt = (url: string) => render(
  <MemoryRouter initialEntries={[url]}>
    <Routes><Route path="/comment/:gameId" element={<CommentGamePage />} /></Routes>
  </MemoryRouter>,
)

beforeEach(() => {
  getJson.mockReset()
  useBusyStore.setState({ tasks: [] })
  useAuthStore.setState({ token: null })
  useSettingsStore.setState({ language: 'en', diagramEvalThumbs: false })
})

describe('CommentGamePage (S4: a book comment opened in a new browser tab)', () => {
  it('loads the commented game with the spinner on and shows it at the ply of the comment', async () => {
    let resolve: (v: unknown) => void = () => {}
    getJson.mockReturnValue(new Promise((r) => { resolve = r }))
    renderAt('/comment/2-7?ply=2')
    expect(getJson).toHaveBeenCalledWith('g/2-7.json')
    expect(useBusyStore.getState().tasks).toHaveLength(1)

    await act(async () => { resolve({ id: '2-7', white: 'Morphy', black: 'Duke', label: 'Partida 7', pgn: '1. e4 {good} e5 2. Nf3 *' }) })
    expect(useBusyStore.getState().tasks).toHaveLength(0)
    expect(screen.getByRole('heading', { name: /Morphy – Duke/ })).toBeTruthy()
    expect(screen.getByText(/Partida 7/)).toBeTruthy()
    expect(screen.getByTestId('board').textContent).toBe(AFTER_E5)
    expect(screen.getByRole('button', { name: /Open .* in the study/ })).toBeTruthy()
  })

  it('says so when the game cannot be read', async () => {
    getJson.mockRejectedValue(new Error('404'))
    renderAt('/comment/9-9')
    expect(await screen.findByRole('alert')).toBeTruthy()
    expect(useBusyStore.getState().tasks).toHaveLength(0)
  })
})
