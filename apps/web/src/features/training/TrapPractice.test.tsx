import { describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { Chess } from 'chess.js'
import { positionHash } from '@chess-ebook/chess-shared'
import { TrapPractice } from './TrapTrainer'
import type { Trap } from './traps'

vi.mock('../../shared/chess/ChessBoard', () => ({
  default: ({ onPieceDrop }: { onPieceDrop?: (f: string, t: string) => boolean }) => (
    <div>
      {[['e2', 'e4'], ['d1', 'h5'], ['f1', 'c4'], ['h5', 'f7'], ['a2', 'a3']].map(([f, t]) => <button key={f + t} onClick={() => onPieceDrop?.(f, t)}>{`${f}${t}`}</button>)}
    </div>
  ),
}))

const c = new Chess(); const keys = [positionHash(c.fen())]
const sans = 'e4 e5 Bc4 Nc6 Qh5 Nf6 Qxf7#'.split(' ').map((m) => { const r = c.move(m); keys.push(positionHash(c.fen())); return r.san })
const scholar: Trap = { id: 's', title: "Scholar's mate", category: 'Classic traps', opening: 'Italian Game', side: 'white', trapMove: 3, setup: 4, fall: 4, tactic: 1, themes: [], intro: 'f7 is weak.', sans, keys, source: { title: 'Classic', author: null } }

describe('practising a trap (S16)', () => {
  it('you play the side that sets it, the opponent falls; a wrong move is shown and counted', () => {
    vi.useFakeTimers()
    const onDone = vi.fn()
    render(<TrapPractice trap={scholar} onDone={onDone} />)
    fireEvent.click(screen.getByText('e2e4'))
    act(() => { vi.advanceTimersByTime(500) })
    fireEvent.click(screen.getByText('a2a3'))
    expect(screen.getByRole('alert')).toHaveTextContent("Not the trap's move. It was Bc4.")
    fireEvent.click(screen.getByText('f1c4'))
    act(() => { vi.advanceTimersByTime(500) })
    fireEvent.click(screen.getByText('d1h5'))
    act(() => { vi.advanceTimersByTime(500) })
    fireEvent.click(screen.getByText('h5f7'))
    act(() => { vi.advanceTimersByTime(500) })
    expect(screen.getByTestId('trap-progress')).toHaveTextContent('1. e4 e5 2. Bc4 Nc6 3. Qh5 Nf6 4. Qxf7#')
    expect(onDone).toHaveBeenCalledWith(false)
    vi.useRealTimers()
  })
})
