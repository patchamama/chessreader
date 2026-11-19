import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { Chess } from 'chess.js'
import { positionHash } from '@chess-ebook/chess-shared'
import { TrapPractice, TrapTrainer } from './TrapTrainer'
import { TrapTryout } from './TrapTryout'
import type { Trap } from './traps'
import { useSettingsStore } from '../../shared/settings/settingsStore'
import { useAnalysisBoards } from '../library/analysis/analysisBoards'

vi.mock('../library/commentdb/commentLookup', () => ({ resourcesConfigured: () => false, getJson: vi.fn() }))
vi.mock('../../shared/api/serverSession', () => ({ hasServerSession: () => false }))

type Props = {
  fen: string; onPieceDrop?: (f: string, t: string) => boolean; onSquareClick?: (s: string) => void
  arrows?: { startSquare: string; endSquare: string }[]; customSquareStyles?: Record<string, unknown>; legalTargets?: string[]; selectedSquare?: string | null
}
vi.mock('../../shared/chess/ChessBoard', () => ({
  default: (p: Props) => (
    <div data-testid="board">
      <span data-testid="board-fen">{p.fen}</span>
      <span data-testid="board-arrows">{(p.arrows ?? []).map((a) => `${a.startSquare}-${a.endSquare}`).join(' ')}</span>
      <span data-testid="board-marked">{Object.keys(p.customSquareStyles ?? {}).sort().join(' ')}</span>
      <span data-testid="board-targets">{(p.legalTargets ?? []).slice().sort().join(' ')}</span>
      {[['e2', 'e4'], ['f1', 'c4'], ['d1', 'h5'], ['h5', 'f7'], ['a2', 'a3']].map(([f, t]) => <button key={f + t} onClick={() => p.onPieceDrop?.(f, t)}>{`${f}${t}`}</button>)}
      {['g1', 'e2', 'e4'].map((s) => <button key={s} onClick={() => p.onSquareClick?.(s)}>{`sq-${s}`}</button>)}
    </div>
  ),
}))

const c = new Chess(); const keys = [positionHash(c.fen())]
const sans = 'e4 e5 Bc4 Nc6 Qh5 Nf6 Qxf7#'.split(' ').map((m) => { const r = c.move(m); keys.push(positionHash(c.fen())); return r.san })
const scholar: Trap = {
  id: 's', title: "Scholar's mate", titleEs: 'Mate del pastor', category: 'Classic traps', opening: 'Italian Game', side: 'white', trapMove: 3, setup: 4, fall: 4, tactic: 1, themes: [],
  intro: 'After 3. Qh5 the attack on f7 along a2-g8 wins.', introEs: 'Tras 3. Dh5 el ataque a f7 gana.', sans, keys, source: { title: 'Classic', author: null },
}
const lococo: Trap = { ...scholar, id: 'lococo-1', intro: 'Las blancas amenazan f7.', introEs: undefined, source: { title: 'Aprende a hacer trampas al ajedrez', author: 'Nicolás Lococo Cobo' } }
const d4trap: Trap = { ...scholar, id: 'd', title: 'Queen trap', ...(() => { const x = new Chess(); const k = [positionHash(x.fen())]; const s = ['d4', 'd5', 'c4'].map((m) => { const r = x.move(m); k.push(positionHash(x.fen())); return r.san }); return { sans: s, keys: k } })() }

beforeEach(() => {
  useSettingsStore.setState({ language: 'en' })
  useAnalysisBoards.setState({ boards: [], active: null })
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify([scholar, d4trap]), { status: 200 })))
})
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers() })

describe('trap practice (S13)', () => {
  it('a wrong move shows the expected move with an arrow and lit squares, in the language', () => {
    useSettingsStore.setState({ language: 'es' })
    vi.useFakeTimers()
    render(<TrapPractice trap={scholar} onDone={() => {}} />)
    fireEvent.click(screen.getByText('e2e4'))
    act(() => { vi.advanceTimersByTime(500) })
    fireEvent.click(screen.getByText('a2a3'))
    expect(screen.getByRole('alert')).toHaveTextContent('No es la jugada de la celada. Era Ac4.')
    expect(screen.getByTestId('board-arrows')).toHaveTextContent('f1-c4')
    expect(screen.getByTestId('board-marked').textContent).toMatch(/c4.*f1/)
  })

  it('a learning mode plays the trap step by step before practising', () => {
    render(<TrapPractice trap={scholar} onDone={() => {}} />)
    fireEvent.click(screen.getByRole('button', { name: 'Learn step by step' }))
    fireEvent.click(screen.getByRole('button', { name: 'Next move' }))
    fireEvent.click(screen.getByRole('button', { name: 'Next move' }))
    expect(screen.getByTestId('board-fen')).toHaveTextContent('rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2')
    fireEvent.click(screen.getByRole('button', { name: 'Previous move' }))
    expect(screen.getByTestId('board-fen')).toHaveTextContent('4P3')
    expect(screen.getByTestId('board-fen')).not.toHaveTextContent('4p3')
    fireEvent.click(screen.getByRole('button', { name: 'Practise now' }))
    expect(screen.getByTestId('board-fen')).toHaveTextContent('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1')
  })

  it('"About this trap" opens no other board; its moves replay on the practice board and its squares are marked', () => {
    render(<TrapPractice trap={scholar} onDone={() => {}} />)
    fireEvent.click(screen.getByText(/About this trap/))
    expect(screen.getAllByTestId('board')).toHaveLength(1)
    const info = screen.getByTestId('trap-info')
    fireEvent.click(within(info).getByRole('button', { name: 'Qh5' }))
    expect(screen.getByTestId('board-fen')).toHaveTextContent('r1bqkbnr/pppp1ppp/2n5/4p2Q/2B1P3/8/PPPP1PPP/RNB1K1NR b KQkq - 3 3')
    fireEvent.click(within(info).getByRole('button', { name: 'a2-g8' }))
    expect(screen.getByTestId('board-marked')).toHaveTextContent('a2 b3 c4 d5 e6 f7 g8')
    expect(screen.getAllByTestId('board')).toHaveLength(1)
  })

  it('selecting a piece shows where it can go', () => {
    render(<TrapPractice trap={scholar} onDone={() => {}} />)
    fireEvent.click(screen.getByText('sq-g1'))
    expect(screen.getByTestId('board-targets')).toHaveTextContent('f3 h3')
  })

  it('a trap from Lococo\'s book opens its text on the analysis board', () => {
    render(<TrapPractice trap={lococo} onDone={() => {}} />)
    fireEvent.click(screen.getByRole('button', { name: /Read it in the book/ }))
    const [board] = useAnalysisBoards.getState().boards
    expect(board.moves).toEqual(sans)
    expect(board.text).toContain('Las blancas amenazan f7.')
    expect(board.source).toContain('Lococo')
  })

  it('shows the captured pieces of each side and keeps the board in its own top-aligned box', () => {
    vi.useFakeTimers()
    render(<TrapPractice trap={scholar} onDone={() => {}} />)
    for (const move of ['e2e4', 'f1c4', 'd1h5', 'h5f7']) {
      fireEvent.click(screen.getAllByText(move)[0])
      act(() => { vi.advanceTimersByTime(500) })
    }
    expect(screen.getByTestId('captured-white')).toHaveTextContent('♟')
    expect(screen.getByTestId('trap-board-box').className).toMatch(/self-start/)
  })
})

describe('trap trainer (S13)', () => {
  it('filters the traps by first move', async () => {
    render(<TrapTrainer />)
    const select = await screen.findByRole('combobox', { name: 'First move' })
    expect(within(select).getAllByRole('option').map((o) => o.textContent)).toEqual(['Any first move', '1. e4', '1. d4'])
    fireEvent.change(select, { target: { value: 'd4' } })
    expect(screen.queryByRole('button', { name: "Practise Scholar's mate" })).toBeNull()
    expect(screen.getByRole('button', { name: 'Practise Queen trap' })).toBeInTheDocument()
  })
})

describe('try a trap in a game (S13)', () => {
  it('as moves are played, keeps the traps still reachable and offers their next moves', async () => {
    const opponent = vi.fn(async () => 'e7e5')
    render(<TrapTryout traps={[scholar, d4trap]} opponent={opponent} />)
    expect(screen.getByTestId('tryout-traps')).toHaveTextContent('2')
    fireEvent.click(screen.getByRole('button', { name: 'Play e4' }))
    await waitFor(() => expect(screen.getByTestId('tryout-moves')).toHaveTextContent('e5'))
    expect(screen.getByTestId('tryout-traps')).toHaveTextContent('1')
    expect(screen.getByRole('button', { name: 'Play Bc4' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Play d4' })).toBeNull()
  })
})
