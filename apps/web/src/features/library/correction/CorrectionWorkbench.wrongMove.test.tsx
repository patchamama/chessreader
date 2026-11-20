import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { recognizeGames } from '@chess-ebook/chess-shared'

const llm = vi.hoisted(() => ({ available: false, vision: false, config: null, complete: vi.fn() }))
vi.mock('../../../shared/llm', () => ({ useLlm: () => llm }))
vi.mock('../errata/errataSource', () => ({ saveErrata: vi.fn() }))
vi.mock('../errata/onlineLookup', () => ({ findOnlineReference: vi.fn() }))
vi.mock('../../suggestions/suggestionsApi', () => ({ saveSuggestion: vi.fn() }))

import { CorrectionWorkbench } from './CorrectionWorkbench'
import { useStudyBoardStore } from '../store/studyBoardStore'
import { useSettingsStore } from '../../../shared/settings/settingsStore'
import { useErrataContext } from '../errata/errataContext'
import { saveErrata } from '../errata/errataSource'
import { saveSuggestion } from '../../suggestions/suggestionsApi'

// "3. Bb4" is a misprint for "3. Bb5".
const CORRUPTED = 'Smith – Jones, London 1985\n1. e4 e5 2. Nf3 Nc6 3. Bb4 a6 4. Ba4 Nf6 5. O-O Be7'
// Black's third move is missing.
const MISSING = 'Smith – Jones, London 1985\n1. e4 e5 2. Nf3 Nc6 3. Bb5 4. Ba4 Nf6 5. O-O Be7'
const save = vi.mocked(saveErrata)
const saveSug = vi.mocked(saveSuggestion)

function open(text: string) {
  render(
    <MemoryRouter>
      <CorrectionWorkbench games={recognizeGames(text, { algorithm: 2 })} text={text} />
    </MemoryRouter>,
  )
  fireEvent.click(screen.getByRole('button', { name: /Correct this game/ }))
  fireEvent.click(screen.getByRole('button', { name: 'Find the wrong move' }))
}

const fixes = () => within(screen.getByTestId('wrong-move-fixes')).getAllByRole('listitem')

beforeEach(() => {
  vi.resetAllMocks()
  llm.available = false
  useStudyBoardStore.getState().reset()
  useSettingsStore.setState({ language: 'en' })
  useErrataContext.setState({ bookId: 7, bookTitle: 'Smith Games', chapter: 2, applied: [] })
})

describe('CorrectionWorkbench wrong-move finder', () => {
  it('lists the right fix first for a game with one corrupted move', () => {
    open(CORRUPTED)
    expect(screen.getByTestId('wrong-move-failing')).toHaveTextContent('3. Bb4')
    const first = fixes()[0]
    expect(first).toHaveTextContent('3. Bb4 → Bb5 (substitute)')
    expect(first).toHaveTextContent('5 later moves play')
    expect(first).toHaveTextContent('complete')
  })

  it('previews how many moves of the game are read after the fix', () => {
    open(CORRUPTED)
    fireEvent.click(within(fixes()[0]).getByRole('button', { name: 'Preview' }))
    expect(within(fixes()[0]).getByTestId('wrong-move-preview')).toHaveTextContent('10 of 10 moves are read (4 before)')
  })

  it('saves a substitution as an errata entry (source engine)', async () => {
    save.mockResolvedValue({ saved: true, path: 'smith-games/2-0.json' })
    open(CORRUPTED)
    fireEvent.click(within(fixes()[0]).getByRole('button', { name: 'Save the correction' }))
    await waitFor(() => expect(screen.getByTestId('wrong-move-saved')).toHaveTextContent('smith-games/2-0.json'))
    expect(saveSug).not.toHaveBeenCalled()
    const entry = save.mock.calls[0][0]
    expect(entry).toMatchObject({ book: { title: 'Smith Games', id: 7 }, chapter: 2, gameIndex: 0 })
    expect(entry.changes).toEqual([expect.objectContaining({ ply: 5, from: 'Bb4', to: 'Bb5', source: 'engine' })])
    expect(entry.corrected.moves[4]).toBe('Bb5')
  })

  it('saves an insertion as a move suggestion with the main lines before and after', async () => {
    saveSug.mockResolvedValue({ saved: true, where: 'server', path: 'suggestions/move/smith-games/x.json' })
    open(MISSING)
    const insert = fixes().find((li) => li.textContent?.includes('(insert)'))!
    expect(fixes()[0]).toBe(insert)
    fireEvent.click(within(insert).getByRole('button', { name: 'Save the correction' }))
    await waitFor(() => expect(screen.getByTestId('wrong-move-saved')).toHaveTextContent('suggestions/move/smith-games/x.json'))
    expect(save).not.toHaveBeenCalled()
    const s = saveSug.mock.calls[0][0]
    expect(s).toMatchObject({ kind: 'move', target: { book: 'Smith Games', chapter: 2, gameIndex: 0 }, author: 'user', status: 'pending' })
    expect(s.before).toEqual(['e4', 'e5', 'Nf3', 'Nc6', 'Bb5', 'Ba4', 'Nf6', 'O-O', 'Be7'])
    expect((s.after as string[]).length).toBe(10)
    expect((s.after as string[])[6]).toBe('Ba4')
  })

  it('asks the AI to rank the fixes, shows its reason and highlights its pick without applying it', async () => {
    llm.available = true
    llm.complete.mockResolvedValue({ text: '{"best": 2, "reason": "The second fix matches the printed text."}', model: 'm' })
    open(CORRUPTED)
    fireEvent.click(screen.getByRole('button', { name: 'Ask the AI to rank' }))
    await waitFor(() => expect(screen.getByTestId('wrong-move-ai')).toHaveTextContent('The second fix matches the printed text.'))
    const request = llm.complete.mock.calls[0][0]
    expect(request.json).toBe(true)
    expect(request.messages[0].text).toContain('Bb4')
    expect(fixes()[1]).toHaveAttribute('data-ai-pick', 'true')
    expect(fixes()[0]).not.toHaveAttribute('data-ai-pick')
    expect(save).not.toHaveBeenCalled()
    expect(saveSug).not.toHaveBeenCalled()
  })

  it('offers no AI ranking without a model', () => {
    open(CORRUPTED)
    expect(screen.queryByRole('button', { name: 'Ask the AI to rank' })).toBeNull()
  })
})
