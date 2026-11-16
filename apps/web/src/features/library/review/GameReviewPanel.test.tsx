import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { recognizeGames } from '@chess-ebook/chess-shared'
import { GameReviewPanel } from './GameReviewPanel'
import { setReviewEngine, useReviewStore, summarise } from './reviewStore'
import { useStudyBoardStore } from '../store/studyBoardStore'
import { useSettingsStore } from '../../../shared/settings/settingsStore'
import { useExternalBookStore } from '../../../shared/externalBook/externalBookStore'

const TEXT = 'Tutor – Novice, 2024\n1. e4 e5 2. Qh5 Nc6 3. Bc4 Nf6 4. Qxf7#'
const games = recognizeGames(TEXT, { algorithm: 2 })
const main = games[0].tree.mainline

// Level game until Black's 3...Nf6 (position after 3. Bc4 is fine for Black, after 3...Nf6 White mates).
const afterNf6 = games[0].tree.nodes.get(main[5])!.fen
const afterBc4 = games[0].tree.nodes.get(main[4])!.fen

function renderPanel() {
  return render(
    <MemoryRouter initialEntries={['/read/7']}>
      <Routes>
        <Route path="/read/7" element={<GameReviewPanel games={games} text={TEXT} bookId={7} chapter={1} />} />
        <Route path="/read/-1" element={<p>annotated book</p>} />
      </Routes>
    </MemoryRouter>,
  )
}

beforeEach(() => {
  useStudyBoardStore.getState().reset()
  useReviewStore.setState({ byTree: new Map(), records: [] })
  useSettingsStore.setState({ language: 'en' })
  setReviewEngine(async (fen) => {
    if (fen === afterNf6) return [{ idx: 1, depth: 8, mate: 1, pv: ['h5f7'] }]
    if (fen === afterBc4) return [{ idx: 1, depth: 8, scoreCp: 30, pv: ['g7g6', 'h5f3', 'g8f6'] }]
    return [{ idx: 1, depth: 8, scoreCp: 20, pv: [] }]
  })
})

describe('GameReviewPanel', () => {
  it('rates both players by name and lists the key moment', async () => {
    renderPanel()
    fireEvent.click(screen.getByRole('button', { name: 'Review game with the engine' }))
    await waitFor(() => expect(screen.getByTestId('accuracy-white')).toBeInTheDocument())
    expect(screen.getByTestId('accuracy-white')).toHaveTextContent('Tutor')
    expect(screen.getByTestId('accuracy-black')).toHaveTextContent('Novice')
    const white = Number(screen.getByTestId('accuracy-white').dataset.accuracy)
    const black = Number(screen.getByTestId('accuracy-black').dataset.accuracy)
    expect(white).toBeGreaterThan(black)
    expect(screen.getByText(/3\.\.\. Nf6\?\?/)).toBeInTheDocument()
    expect(screen.getByText(/Better was 3\.\.\. g6 4\. Qf3 Nf6/)).toBeInTheDocument()
  })

  it('a key moment links back to its position', async () => {
    renderPanel()
    fireEvent.click(screen.getByRole('button', { name: 'Review game with the engine' }))
    await waitFor(() => expect(screen.getByRole('button', { name: 'Go to 3... Nf6' })).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: 'Go to 3... Nf6' }))
    expect(useStudyBoardStore.getState().currentNodeId).toBe(main[5])
  })

  it('opens the game annotated at the chosen level', async () => {
    renderPanel()
    fireEvent.click(screen.getByRole('button', { name: 'Review game with the engine' }))
    await waitFor(() => expect(screen.getByRole('button', { name: 'Open annotated game' })).toBeInTheDocument())
    fireEvent.change(screen.getByLabelText('Commentary level'), { target: { value: '3' } })
    fireEvent.click(screen.getByRole('button', { name: 'Open annotated game' }))
    expect(screen.getByText('annotated book')).toBeInTheDocument()
    const html = useExternalBookStore.getState().chapters[0].html
    expect(html).toContain('Nf6??')
    expect(html).toContain('Blunder')
    expect(html).toContain('(3... g6 4. Qf3 Nf6)')
  })

  it('keeps a record per book and chapter and sums players up', async () => {
    renderPanel()
    fireEvent.click(screen.getByRole('button', { name: 'Review game with the engine' }))
    await waitFor(() => expect(useReviewStore.getState().records).toHaveLength(1))
    const [record] = useReviewStore.getState().records
    expect(record).toMatchObject({ bookId: 7, chapter: 1, gameIndex: 0, white: 'Tutor', black: 'Novice' })
    expect(screen.getByTestId('book-summary')).toHaveTextContent('Tutor')
    expect(summarise([record, { ...record, gameIndex: 1, accuracyWhite: 50 }]).find((p) => p.name === 'Tutor')!.games).toBe(2)
  })
})
