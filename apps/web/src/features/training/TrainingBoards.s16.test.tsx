import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { Chess } from 'chess.js'
import { positionHash } from '@chess-ebook/chess-shared'
import { TrapTryout } from './TrapTryout'
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

type Props = {
  fen: string; orientation?: string; onPieceDrop?: (f: string, t: string) => boolean; onSquareClick?: (s: string) => void
  arrows?: { startSquare: string; endSquare: string; color?: string }[]; customSquareStyles?: Record<string, unknown>
}
vi.mock('../../shared/chess/ChessBoard', () => ({
  default: (p: Props) => (
    <div data-testid="board">
      <span data-testid="board-orientation">{p.orientation}</span>
      <span data-testid="board-arrows">{(p.arrows ?? []).map((a) => `${a.startSquare}-${a.endSquare}`).join(' ')}</span>
      <span data-testid="board-marked">{Object.keys(p.customSquareStyles ?? {}).sort().join(' ')}</span>
      {['e2', 'f1', 'g1', 'e7'].map((s) => <button key={s} onClick={() => p.onSquareClick?.(s)}>{`sq-${s}`}</button>)}
    </div>
  ),
}))

const line = (moves: string) => { const c = new Chess(); const keys = [positionHash(c.fen())]; const sans = moves.split(' ').map((m) => { const r = c.move(m); keys.push(positionHash(c.fen())); return r.san }); return { sans, keys } }
const base = { category: 'Classic traps', trapMove: 3, setup: 3, fall: 3, tactic: 2, themes: [], intro: '', source: { title: 'x', author: null } }
const scholar: Trap = { ...base, id: 's', title: "Scholar's mate", opening: 'Italian Game', side: 'white', fall: 4, ...line('e4 e5 Bc4 Nc6 Qh5 Nf6 Qxf7#') }
const ruy: Trap = { ...base, id: 'r', title: 'Ruy trap', opening: 'Ruy Lopez', side: 'white', ...line('e4 e5 Bb5 a6 Ba4 b5 Bb3') }

const playButton = (san: string) => screen.getByRole('button', { name: `Play ${san}` })
const movesList = () => within(screen.getByTestId('tryout-moves'))

beforeEach(() => {
  localStorage.clear()
  useTrainingPrefs.setState({ showEval: false })
  useSettingsStore.setState({ language: 'en', notationStyle: 'letters' })
})
afterEach(() => vi.useRealTimers())

describe('try a trap board (S16)', () => {
  it('hovering a proposed move shows it on the board', () => {
    render(<TrapTryout traps={[scholar, ruy]} />)
    fireEvent.mouseEnter(playButton('e4'))
    expect(screen.getByTestId('board-arrows')).toHaveTextContent('e2-e4')
    expect(screen.getByTestId('board-marked')).toHaveTextContent('e2 e4')
    fireEvent.mouseLeave(playButton('e4'))
    expect(screen.getByTestId('board-arrows')).toHaveTextContent('')
  })

  it('lists the played moves, clickable, to go back and try another branch', () => {
    useSettingsStore.setState({ language: 'es' })
    render(<TrapTryout traps={[scholar, ruy]} />)
    fireEvent.change(screen.getByRole('combobox', { name: 'Opponent' }), { target: { value: 'human' } })
    fireEvent.click(playButton('e4'))
    fireEvent.click(playButton('e5'))
    fireEvent.click(playButton('Bc4'))
    expect(screen.getByTestId('tryout-moves')).toHaveTextContent('1. e4 e5 2. Ac4')
    fireEvent.click(movesList().getByRole('button', { name: 'e5' }))
    expect(screen.getByTestId('tryout-moves')).toHaveTextContent('1. e4 e5')
    expect(screen.getByTestId('tryout-moves')).not.toHaveTextContent('Ac4')
    // Another branch from here.
    fireEvent.click(playButton('Bb5'))
    expect(screen.getByTestId('tryout-moves')).toHaveTextContent('1. e4 e5 2. Ab5')
  })

  it('a back control takes back the last move (to your previous turn against an opponent)', async () => {
    const opponent = vi.fn(async () => 'e7e5')
    render(<TrapTryout traps={[scholar, ruy]} opponent={opponent} />)
    expect(screen.getByRole('button', { name: 'Back' })).toBeDisabled()
    fireEvent.click(playButton('e4'))
    await waitFor(() => expect(screen.getByTestId('tryout-moves')).toHaveTextContent('e5'))
    fireEvent.click(screen.getByRole('button', { name: 'Back' }))
    expect(screen.getByTestId('tryout-moves')).toHaveTextContent('')
    expect(playButton('e4')).toBeInTheDocument()
  })

  it('clicking a piece shows in green, one arrow after another, the trap moves of that piece', () => {
    vi.useFakeTimers()
    render(<TrapTryout traps={[scholar, ruy]} />)
    fireEvent.change(screen.getByRole('combobox', { name: 'Opponent' }), { target: { value: 'human' } })
    fireEvent.click(playButton('e4'))
    fireEvent.click(playButton('e5'))
    fireEvent.click(screen.getByText('sq-f1'))
    const first = screen.getByTestId('board-arrows').textContent
    expect(['f1-c4', 'f1-b5']).toContain(first)
    act(() => { vi.advanceTimersByTime(1300) })
    const second = screen.getByTestId('board-arrows').textContent
    expect(['f1-c4', 'f1-b5']).toContain(second)
    expect(second).not.toBe(first)
    expect(screen.getByTestId('board-marked').textContent).toContain('f1')
    // A piece with no trap move shows nothing.
    fireEvent.click(screen.getByText('sq-g1'))
    expect(screen.getByTestId('board-arrows')).toHaveTextContent('')
  })
})

describe('training boards: flip and evaluation (S17)', () => {
  it('every training board can be flipped', () => {
    render(<TrapBoard fen={new Chess().fen()} orientation="white" />)
    expect(screen.getByTestId('board-orientation')).toHaveTextContent('white')
    fireEvent.click(screen.getByRole('button', { name: 'Flip board' }))
    expect(screen.getByTestId('board-orientation')).toHaveTextContent('black')
  })

  it('an option shows the evaluation bar with the engine text in the selected notation, and is remembered', () => {
    useSettingsStore.setState({ language: 'es' })
    const { unmount } = render(<TrapPractice trap={scholar} onDone={() => {}} />)
    expect(screen.queryByTestId('training-eval')).toBeNull()
    fireEvent.click(screen.getByRole('checkbox', { name: 'Show evaluation' }))
    expect(screen.getByTestId('training-eval')).toHaveTextContent('+0.35')
    expect(screen.getByTestId('training-eval')).toHaveTextContent('1. e4 e5 2. Cf3')
    expect(screen.getByLabelText(/Evaluation: \+0\.3/)).toBeInTheDocument()
    unmount()
    expect(JSON.parse(localStorage.getItem('chessreader-training-prefs') ?? '{}')).toEqual({ showEval: true })
    render(<TrapTryout traps={[scholar]} />)
    expect(screen.getByRole('checkbox', { name: 'Show evaluation' })).toBeChecked()
    expect(screen.getByTestId('training-eval')).toBeInTheDocument()
  })
})

describe('a trap offered in Try a trap opens in a modal to replay and read (llm-assistant-round S11)', () => {
  it('each trap name is a link that opens a modal with a step-by-step board and the explanation; Escape closes it', () => {
    const withIntro: Trap = { ...scholar, intro: 'The queen and bishop aim at f7, defended only by the king.' }
    render(<TrapTryout traps={[withIntro, ruy]} />)
    fireEvent.click(screen.getAllByRole('button', { name: "Show the trap Scholar's mate" })[0])
    const dialog = screen.getByRole('dialog', { name: "Scholar's mate" })
    expect(within(dialog).getByText(/aim at f7/)).toBeInTheDocument()
    expect(within(dialog).getByText('Italian Game', { exact: false })).toBeInTheDocument()
    // The trap's line can be replayed move by move.
    expect(within(dialog).getByTestId('trap-preview-player')).toBeInTheDocument()
    fireEvent.keyDown(dialog, { key: 'Escape' })
    expect(screen.queryByRole('dialog')).toBeNull()
  })
})
