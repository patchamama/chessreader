import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { Chess } from 'chess.js'
import { positionHash } from '@chess-ebook/chess-shared'
import { TrapPractice, TrapTrainer } from './TrapTrainer'
import type { Trap } from './traps'
import { useSettingsStore } from '../../shared/settings/settingsStore'

vi.mock('../../shared/chess/ChessBoard', () => ({
  default: ({ fen, onPieceDrop }: { fen: string; onPieceDrop?: (f: string, t: string) => boolean }) => (
    <div data-testid="board">
      {fen}
      {[['e2', 'e4'], ['f1', 'c4'], ['d1', 'h5'], ['h5', 'f7']].map(([f, t]) => <button key={f + t} onClick={() => onPieceDrop?.(f, t)}>{`${f}${t}`}</button>)}
    </div>
  ),
}))

const c = new Chess(); const keys = [positionHash(c.fen())]
const sans = 'e4 e5 Bc4 Nc6 Qh5 Nf6 Qxf7#'.split(' ').map((m) => { const r = c.move(m); keys.push(positionHash(c.fen())); return r.san })
const scholar: Trap = { id: 's', title: "Scholar's mate", category: 'Classic traps', opening: 'Italian Game', side: 'white', trapMove: 3, setup: 4, fall: 4, tactic: 1, themes: ['mate'], intro: 'f7 is weak.', sans, keys, source: { title: 'Classic', author: null } }

beforeEach(() => {
  useSettingsStore.setState({ language: 'en' })
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify([scholar]), { status: 200 })))
})
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers() })

describe('trap practice with a replay and info (S5, S6)', () => {
  it('when the trap is done, its whole line can be replayed', () => {
    vi.useFakeTimers()
    render(<TrapPractice trap={scholar} onDone={() => {}} />)
    expect(screen.queryByTestId('trap-line')).toBeNull()
    for (const move of ['e2e4', 'f1c4', 'd1h5', 'h5f7']) {
      fireEvent.click(screen.getAllByText(move)[0])
      act(() => { vi.advanceTimersByTime(500) })
    }
    expect(screen.getByTestId('trap-line-moves')).toHaveTextContent('1. e4 e5 2. Bc4 Nc6 3. Qh5 Nf6 4. Qxf7#')
    fireEvent.click(screen.getByRole('button', { name: 'Last move' }))
    expect(screen.getByTestId('trap-line-board')).toHaveTextContent('r1bqkb1r/pppp1Qpp/2n2n2/4p3/2B1P3/8/PPPP1PPP/RNB1K1NR b KQkq - 0 4')
  })

  it('explains the trap: its idea, its opening and its patterns, in an info section', () => {
    render(<TrapPractice trap={scholar} onDone={() => {}} />)
    fireEvent.click(screen.getByText(/About this trap/))
    const info = screen.getByTestId('trap-info')
    expect(info).toHaveTextContent('The idea: f7 is weak.')
    expect(info).toHaveTextContent('Opening: Italian Game')
    expect(info).toHaveTextContent('Checkmate')
  })

  it('the trainer explains what a trap is', async () => {
    render(<TrapTrainer />)
    fireEvent.click(await screen.findByText(/About traps/))
    expect(screen.getByText(/An opening trap is a line/)).toBeInTheDocument()
  })
})
