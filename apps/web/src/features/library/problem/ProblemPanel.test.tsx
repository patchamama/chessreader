import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { recognizeGames } from '@chess-ebook/chess-shared'
import { ProblemPanel } from './ProblemPanel'
import { setProblemRuntime, useProblemStore } from './problemStore'
import { useStudyBoardStore } from '../store/studyBoardStore'
import { useSettingsStore } from '../../../shared/settings/settingsStore'

const TEXT = '1. e4 e5 2. Nf3 d6 3. d4 Bg4 4. dxe5 Bxf3 5. Qxf3 dxe5 6. Bc4 Nf6 7. Qb3! Qe7 8. Nc3 c6'
const games = recognizeGames(TEXT, { algorithm: 2 })

beforeEach(() => {
  useStudyBoardStore.getState().reset()
  useProblemStore.getState().stop()
  setProblemRuntime({ delay: async () => {} })
  useSettingsStore.setState({ language: 'en' })
})

describe('ProblemPanel', () => {
  it('asks for the move at the key position and gives a hint on request', async () => {
    render(<ProblemPanel games={games} text={TEXT} />)
    expect(screen.getByText('1 key positions')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /Start problems/ }))
    await waitFor(() => expect(screen.getByText(/White to move\. Find the move played in the game\./)).toBeInTheDocument())
    expect(screen.getByText('3 attempts left')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /Hint/ }))
    expect(screen.getByTestId('problem-hint')).toHaveTextContent('Move the queen.')
    fireEvent.click(screen.getByRole('button', { name: 'Show the move' }))
    expect(screen.getByText(/The move was/)).toHaveTextContent('7. Qb3!')
    fireEvent.click(screen.getByRole('button', { name: 'Finish' }))
    await waitFor(() => expect(screen.getByText('Done: 0 of 1')).toBeInTheDocument())
  })
})

describe('the book text during a problem', () => {
  it('is veiled while the move is being looked for and shown again afterwards', async () => {
    const { default: BookReader } = await import('../components/BookReader')
    const { MemoryRouter, Route, Routes } = await import('react-router-dom')
    const { QueryClient, QueryClientProvider } = await import('@tanstack/react-query')
    const { useExternalBookStore, EXTERNAL_BOOK_ID } = await import('../../../shared/externalBook/externalBookStore')
    useExternalBookStore.getState().open('Opera', [{ title: 'Opera', html: `<p>${TEXT}</p>`, toc: [{ order: 1, title: 'Opera' }] }])
    render(
      <QueryClientProvider client={new QueryClient()}>
        <MemoryRouter initialEntries={[`/read/${EXTERNAL_BOOK_ID}`]}>
          <Routes><Route path="/read/:bookId" element={<BookReader />} /></Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    )
    const veil = await screen.findByTestId('prose-veil')
    expect(veil.className).not.toContain('blur')
    fireEvent.click(await screen.findByRole('button', { name: /Start problems/ }))
    await waitFor(() => expect(screen.getByTestId('prose-veil').className).toContain('blur'))
    fireEvent.click(screen.getByRole('button', { name: 'Show the move' }))
    await waitFor(() => expect(screen.getByTestId('prose-veil').className).not.toContain('blur'))
  })
})
