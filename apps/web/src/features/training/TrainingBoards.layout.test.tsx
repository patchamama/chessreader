import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { Chess } from 'chess.js'
import { positionHash } from '@chess-ebook/chess-shared'
import { TrapBoard } from './TrapBoard'
import { TrapPractice } from './TrapTrainer'
import { useTrainingPrefs } from './trainingPrefs'
import type { Trap } from './traps'
import { useSettingsStore } from '../../shared/settings/settingsStore'

vi.mock('../library/commentdb/commentLookup', () => ({ resourcesConfigured: () => false, getJson: vi.fn() }))
vi.mock('../../shared/api/serverSession', () => ({ hasServerSession: () => false }))
vi.mock('./trainingEngine', () => ({
  useTrainingEngine: (_fen: string, enabled: boolean) => (enabled ? { loading: false, scoreCp: 35, pv: ['e2e4', 'e7e5', 'g1f3'] } : { loading: false, pv: [] }),
}))
vi.mock('../../shared/chess/ChessBoard', () => ({
  default: ({ fen }: { fen: string }) => <div data-testid="board">{fen}</div>,
}))

const line = (moves: string) => { const c = new Chess(); const keys = [positionHash(c.fen())]; const sans = moves.split(' ').map((m) => { const r = c.move(m); keys.push(positionHash(c.fen())); return r.san }); return { sans, keys } }
const scholar: Trap = {
  id: 's', title: "Scholar's mate", opening: 'Italian Game', side: 'white', category: 'Classic traps', trapMove: 3, setup: 3, fall: 4, tactic: 2,
  themes: [], intro: 'Queen and bishop aim at f7.', source: { title: 'x', author: null }, ...line('e4 e5 Bc4 Nc6 Qh5 Nf6 Qxf7#'),
}
const START = new Chess().fen()

beforeEach(() => {
  localStorage.clear()
  useTrainingPrefs.setState({ showEval: false })
  useSettingsStore.setState({ language: 'en', notationStyle: 'letters', diagramEvalThumbs: false })
})

describe('training boards keep their shape (S18)', () => {
  it('the board sits in a square, top-aligned box that a taller column beside it cannot stretch', () => {
    render(<TrapBoard fen={START} orientation="white" />)
    const box = screen.getByTestId('trap-board-box')
    expect(box).toHaveClass('self-start', 'shrink-0')
    const square = screen.getByTestId('trap-board-box-square')
    expect(square).toHaveClass('aspect-square')
    expect(within(square).getByTestId('board')).toBeInTheDocument()
  })

  it('the evaluation bar stands at the right of the board, as tall as it, with the engine line below', () => {
    useTrainingPrefs.setState({ showEval: true })
    render(<TrapBoard fen={START} orientation="white" />)
    const row = screen.getByTestId('trap-board-box-row')
    const square = within(row).getByTestId('trap-board-box-square')
    const bar = within(row).getByTestId('training-eval-bar')
    // The bar comes right after the board, in the same row, and stretches to its height.
    expect(square.nextElementSibling).toBe(bar)
    expect(bar).toHaveClass('self-stretch')
    expect(within(bar).getByLabelText(/Evaluation: \+0\.3/)).toBeInTheDocument()
    // The engine's line is outside that row (below the board).
    const text = screen.getByTestId('training-eval')
    expect(row.contains(text)).toBe(false)
    expect(text).toHaveTextContent('+0.35')
    expect(text).toHaveTextContent('1. e4 e5 2. Nf3')
  })

  it('the trap practice row is top-aligned', () => {
    render(<TrapPractice trap={scholar} onDone={() => {}} />)
    expect(screen.getByTestId('trap-board-box').parentElement).toHaveClass('items-start')
  })
})

describe('moves in the trap notes play on the training board (S19)', () => {
  it('a move of the Wikipedia summary of the opening shows its position on the practice board', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
      extract: 'The Italian Game is a chess opening beginning with the moves:1. e4 e5 2. Nf3 Nc6 3. Bc4',
      content_urls: { desktop: { page: 'https://en.wikipedia.org/wiki/Italian_Game' } },
    }), { status: 200 })))
    render(<TrapPractice trap={scholar} onDone={() => {}} initialMode="learn" />)
    fireEvent.click(screen.getByText(/About this trap/))
    const info = screen.getByTestId('trap-info')
    await waitFor(() => expect(within(info).getByRole('button', { name: 'Nf3' })).toBeInTheDocument())
    fireEvent.click(within(info).getByRole('button', { name: 'Nf3' }))
    const c = new Chess(); c.move('e4'); c.move('e5'); c.move('Nf3')
    expect(screen.getByTestId('board')).toHaveTextContent(c.fen())
    vi.unstubAllGlobals()
  })
})
