import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { recognizeGames } from '@chess-ebook/chess-shared'

vi.mock('../errata/errataSource', () => ({ saveErrata: vi.fn() }))
vi.mock('../errata/onlineLookup', () => ({ findOnlineReference: vi.fn() }))

import { CorrectionWorkbench } from './CorrectionWorkbench'
import { useStudyBoardStore } from '../store/studyBoardStore'
import { useSettingsStore } from '../../../shared/settings/settingsStore'
import { useErrataContext } from '../errata/errataContext'
import { saveErrata } from '../errata/errataSource'
import { findOnlineReference } from '../errata/onlineLookup'

// "3. Bb4" is a misprint for "3. Bb5".
const TEXT = 'Smith – Jones, London 1985\n1. e4 e5 2. Nf3 Nc6 3. Bb4 a6 4. Ba4 Nf6 5. O-O Be7'
const games = recognizeGames(TEXT, { algorithm: 2 })
const save = vi.mocked(saveErrata)
const lookup = vi.mocked(findOnlineReference)

function open() {
  render(
    <MemoryRouter initialEntries={['/x']}>
      <Routes>
        <Route path="/x" element={<CorrectionWorkbench games={games} text={TEXT} />} />
        <Route path="/read/-1" element={<p>reader</p>} />
      </Routes>
    </MemoryRouter>,
  )
  fireEvent.click(screen.getByRole('button', { name: /Correct this game/ }))
}

beforeEach(() => {
  vi.resetAllMocks()
  useStudyBoardStore.getState().reset()
  useSettingsStore.setState({ language: 'en', lichessToken: 'tok' })
  useErrataContext.setState({ bookId: 7, bookTitle: 'Smith Games', chapter: 2, applied: [] })
})

describe('CorrectionWorkbench errata', () => {
  it('saves the accepted repair of the reader as an errata entry (source engine)', async () => {
    save.mockResolvedValue({ saved: true, path: 'smith-games/2-0.json' })
    open()
    expect(screen.getByRole('button', { name: 'Save as errata' })).toBeDisabled()
    fireEvent.click(screen.getByRole('button', { name: 'Use Bb5' }))
    fireEvent.click(screen.getByRole('button', { name: 'Save as errata' }))
    await waitFor(() => expect(screen.getByTestId('errata-status')).toHaveTextContent('Saved as errata: smith-games/2-0.json'))
    const entry = save.mock.calls[0][0]
    expect(entry).toMatchObject({
      book: { title: 'Smith Games', id: 7 }, chapter: 2, gameIndex: 0,
      game: { label: 'Smith – Jones', white: 'Smith', black: 'Jones' },
      changes: [{ ply: 5, from: 'Bb4', to: 'Bb5', source: 'engine' }],
    })
    expect(entry.corrected.moves[4]).toBe('Bb5')
  })

  it('without a server, shows the JSON to copy into the resources repository', async () => {
    save.mockResolvedValue({ saved: false, path: 'errata/smith-games/2-0.json', json: '{"id":"smith-games-2-0"}' })
    open()
    fireEvent.click(screen.getByRole('button', { name: 'Use Bb5' }))
    fireEvent.click(screen.getByRole('button', { name: 'Save as errata' }))
    await waitFor(() => expect(screen.getByLabelText('Errata JSON')).toHaveValue('{"id":"smith-games-2-0"}'))
    expect(screen.getByTestId('errata-status')).toHaveTextContent('errata/smith-games/2-0.json')
  })

  it('a move typed by hand is a manual change', async () => {
    save.mockResolvedValue({ saved: true, path: 'p' })
    open()
    fireEvent.change(screen.getByLabelText('Move 3.'), { target: { value: 'Bc4' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save as errata' }))
    await waitFor(() => expect(save).toHaveBeenCalled())
    expect(save.mock.calls[0][0].changes).toEqual([{ ply: 5, from: 'Bb4', to: 'Bc4', source: 'manual' }])
  })

  it('searches the game online and takes its moves (source online, with the game as evidence)', async () => {
    lookup.mockResolvedValue({
      status: 'found', id: 'abc', url: 'https://lichess.org/import/master/abc/white', white: 'Smith, A', black: 'Jones, B', year: 1985,
      reference: [], changes: [{ ply: 5, from: 'Bb4', to: 'Bb5' }],
    })
    save.mockResolvedValue({ saved: true, path: 'p' })
    open()
    fireEvent.click(screen.getByRole('button', { name: 'Search online' }))
    await waitFor(() => expect(screen.getByTestId('online-status')).toHaveTextContent('Smith, A – Jones, B (1985): 1 move differs'))
    expect(lookup.mock.calls[0][0]).toMatchObject({ white: 'Smith', black: 'Jones', year: 1985 })
    expect(lookup.mock.calls[0][1]).toMatchObject({ token: 'tok' })
    expect(screen.getByLabelText('Move 3.')).toHaveValue('Bb5')
    fireEvent.click(screen.getByRole('button', { name: 'Save as errata' }))
    await waitFor(() => expect(save).toHaveBeenCalled())
    expect(save.mock.calls[0][0].changes).toEqual([
      { ply: 5, from: 'Bb4', to: 'Bb5', source: 'online', evidence: 'https://lichess.org/import/master/abc/white' },
    ])
  })

  it('says why no online reference was found', async () => {
    lookup.mockResolvedValue({ status: 'not-found', reason: 'Games played before 1952 are usually not in it.' })
    open()
    fireEvent.click(screen.getByRole('button', { name: 'Search online' }))
    await waitFor(() => expect(screen.getByTestId('online-status')).toHaveTextContent('Games played before 1952 are usually not in it.'))
  })

  it('accepting the correction (opening the corrected text) saves the errata automatically', async () => {
    save.mockResolvedValue({ saved: true, path: 'p' })
    open()
    fireEvent.click(screen.getByRole('button', { name: 'Use Bb5' }))
    fireEvent.click(screen.getByRole('button', { name: 'Open corrected text in the reader' }))
    await waitFor(() => expect(save).toHaveBeenCalledTimes(1))
    expect(save.mock.calls[0][0].changes[0]).toMatchObject({ ply: 5, to: 'Bb5', source: 'engine' })
  })
})
