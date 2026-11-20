import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, render, screen } from '@testing-library/react'
import { PROSE_REVEAL_STEP_MS } from '@chess-ebook/chess-shared'
import { MoveTooltipCard } from './MoveTooltipCard'
import { useSettingsStore } from '../../../shared/settings/settingsStore'

vi.mock('../../../shared/chess/ChessBoard', () => ({
  default: ({ arrows, customSquareStyles }: { arrows?: { startSquare: string; endSquare: string }[]; customSquareStyles?: Record<string, unknown> }) => (
    <div
      data-testid="thumb"
      data-arrows={(arrows ?? []).map((a) => `${a.startSquare}${a.endSquare}`).join(' ')}
      data-squares={Object.keys(customSquareStyles ?? {}).join(' ')}
    />
  ),
}))

const FEN = '4k3/8/8/8/8/8/PPP2PPP/4K3 w - - 0 20'
const matchMedia = (reduced: boolean) =>
  vi.stubGlobal('matchMedia', (q: string) => ({ matches: reduced && q.includes('reduce'), addEventListener() {}, removeEventListener() {} }))

beforeEach(() => { useSettingsStore.getState().reset(); vi.useFakeTimers() })
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals() })

describe('MoveTooltipCard prose references (S16)', () => {
  it('draws every arrow and every square of a reference', () => {
    render(<MoveTooltipCard fen={FEN} lastMove={null} line={['h2', 'h4', 'h5']} arrows={[['h2', 'h4'], ['h4', 'h5']]} />)
    const t = screen.getByTestId('thumb')
    expect(t.dataset.arrows).toBe('h2h4 h4h5')
    expect(t.dataset.squares).toBe('h2 h4 h5')
  })

  it('a flank lights its pawns one after another, then keeps them lit', () => {
    matchMedia(false)
    const seq = ['f2', 'g2', 'h2']
    render(<MoveTooltipCard fen={FEN} lastMove={null} line={seq} sequence={seq} />)
    const squares = () => screen.getByTestId('thumb').dataset.squares
    expect(squares()).toBe('f2')
    act(() => { vi.advanceTimersByTime(PROSE_REVEAL_STEP_MS) })
    expect(squares()).toBe('f2 g2')
    act(() => { vi.advanceTimersByTime(PROSE_REVEAL_STEP_MS) })
    expect(squares()).toBe('f2 g2 h2')
    act(() => { vi.advanceTimersByTime(PROSE_REVEAL_STEP_MS * 5) })
    expect(squares()).toBe('f2 g2 h2')
  })

  it('with reduced motion all squares light at once', () => {
    matchMedia(true)
    const seq = ['f2', 'g2', 'h2']
    render(<MoveTooltipCard fen={FEN} lastMove={null} line={seq} sequence={seq} />)
    expect(screen.getByTestId('thumb').dataset.squares).toBe('f2 g2 h2')
  })
})
