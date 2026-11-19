import { describe, it, expect, vi, beforeEach } from 'vitest'
import { act, render, screen, fireEvent } from '@testing-library/react'
import PlayPage from './PlayPage'
import { usePlayStore, setPlayRuntime } from './playStore'
import { useSettingsStore } from '../../shared/settings/settingsStore'
import { Chess } from 'chess.js'
import { positionHash } from '@chess-ebook/chess-shared'
import { lookupPositionComments } from '../library/commentdb/commentLookup'
import { usePlayPrefs } from './playPrefs'
import { clearPieceAnalysis } from './pieceAnalysis'

// These tests run without a server (jsdom's host is localhost, where the app would ask it).
vi.mock('../../shared/api/serverSession', () => ({ hasServerSession: () => false }))


vi.mock('./humanMoves', () => ({ humanMoves: vi.fn(async () => ({ rating: 1500, moves: [{ san: 'e4', probability: 0.41 }, { san: 'd4', probability: 0.32 }] })) }))
vi.mock('../viewer/components/EvalBar', () => ({ default: ({ direction }: { direction?: string }) => <div data-testid="evalbar" data-direction={direction} /> }))
vi.mock('../library/review/useMoveHints', () => ({ useMoveHints: () => ({}) }))

vi.mock('../../shared/chess/ChessBoard', () => ({
  default: ({ fen, onSquareClick, arrows, customSquareStyles }: { fen: string; onSquareClick?: (s: string) => void; arrows?: { startSquare: string; endSquare: string }[]; customSquareStyles?: Record<string, unknown> }) => (
    <div data-testid="board">{fen}{['e2', 'e4'].map((s) => <button key={s} onClick={() => onSquareClick?.(s)}>sq-{s}</button>)}
      <span data-testid="board-arrows">{(arrows ?? []).map((a) => `${a.startSquare}${a.endSquare}`).join(',')}</span>
      <span data-testid="board-squares">{Object.keys(customSquareStyles ?? {}).sort().join(',')}</span>
    </div>
  ),
}))
vi.mock('../library/commentdb/commentLookup', async (orig) => ({
  ...(await orig<typeof import('../library/commentdb/commentLookup')>()),
  lookupPositionComments: vi.fn(async () => []),
}))
vi.mock('./bookPositions', async (orig) => {
  const real = await orig<typeof import('./bookPositions')>()
  const g = (id: string, pgn: string, result: string, white: string, black: string) => ({ id, white, black, year: 1960, opening: '', result, moves: 30, first: 'e4', pgn, termination: 'resignation' })
  const index = real.buildPositionIndex([{ book: 'b1', games: [g('g1', '1. e4 c5', '1-0', 'Fischer', 'Tal'), g('g2', '1. e4 e5', '0-1', 'Spassky', 'Petrosian')] }])
  return { ...real, loadPositionIndex: vi.fn(async () => index) }
})

beforeEach(() => {
  useSettingsStore.setState({ language: 'en' })
  setPlayRuntime({ analyse: vi.fn(async () => [{ idx: 1, pv: ['e7e5'], scoreCp: 0, depth: 1 }]) as never })
  usePlayStore.getState().reset()
  usePlayPrefs.getState().reset()
  clearPieceAnalysis()
})

describe('PlayPage', () => {
  it('starts a game against the engine at the chosen strength', () => {
    render(<PlayPage />)
    fireEvent.change(screen.getByLabelText('Engine strength'), { target: { value: '6' } })
    fireEvent.click(screen.getByRole('button', { name: 'New game' }))
    expect(usePlayStore.getState()).toMatchObject({ status: 'playing', strength: 6, mode: 'engine' })
  })
  it('a move can be made by clicking the piece and then its square', async () => {
    render(<PlayPage />)
    fireEvent.click(screen.getByRole('button', { name: 'New game' }))
    fireEvent.click(screen.getByRole('button', { name: 'sq-e2' }))
    fireEvent.click(screen.getByRole('button', { name: 'sq-e4' }))
    expect(usePlayStore.getState().sans[0]).toBe('e4')
  })
  it('Lichess needs a token with board:play and shows where to create it', () => {
    render(<PlayPage />)
    fireEvent.change(screen.getByLabelText('Opponent'), { target: { value: 'lichess' } })
    expect((screen.getByRole('button', { name: 'New game' }) as HTMLButtonElement).disabled).toBe(true)
    expect(screen.getByRole('link', { name: /Create a token/ }).getAttribute('href')).toContain('board:play')
  })
  it('a Lichess game can be played at the chosen clock', () => {
    useSettingsStore.setState({ lichessToken: 'tok' })
    const start = vi.spyOn(usePlayStore.getState(), 'start').mockImplementation(() => {})
    render(<PlayPage />)
    fireEvent.change(screen.getByLabelText('Opponent'), { target: { value: 'lichess' } })
    fireEvent.change(screen.getByLabelText('Clock'), { target: { value: '15+10' } })
    fireEvent.click(screen.getByRole('button', { name: 'New game' }))
    expect(start).toHaveBeenCalledWith(expect.objectContaining({ mode: 'lichess', token: 'tok', clock: { minutes: 15, increment: 10 } }))
    start.mockRestore()
  })
  it('the Lichess AI: level and colour, same token', () => {
    useSettingsStore.setState({ lichessToken: 'tok' })
    const start = vi.spyOn(usePlayStore.getState(), 'start').mockImplementation(() => {})
    render(<PlayPage />)
    fireEvent.change(screen.getByLabelText('Opponent'), { target: { value: 'lichess-ai' } })
    fireEvent.change(screen.getByLabelText('I play'), { target: { value: 'black' } })
    fireEvent.change(screen.getByLabelText('Engine strength'), { target: { value: '5' } })
    fireEvent.click(screen.getByRole('button', { name: 'New game' }))
    expect(start).toHaveBeenCalledWith(expect.objectContaining({ mode: 'lichess-ai', color: 'black', strength: 5, token: 'tok', clock: { minutes: 10, increment: 5 } }))
    start.mockRestore()
  })

  it('options: hint colours, move status, eval bar, legend and voice can be switched (S11–S13)', () => {
    render(<PlayPage />)
    fireEvent.click(screen.getByLabelText('Colour the moves of the selected piece'))
    fireEvent.click(screen.getByLabelText('Say how good each move is'))
    fireEvent.click(screen.getByLabelText('Evaluation bar'))
    fireEvent.click(screen.getByLabelText('Legend of the colours'))
    fireEvent.change(screen.getByLabelText('Say the moves aloud'), { target: { value: 'both' } })
    expect(useSettingsStore.getState()).toMatchObject({ playMoveHints: false, playMoveStatus: false, playEvalBar: true, playLegend: false, playVoice: 'both' })
    useSettingsStore.getState().reset()
  })
  it('shows the legend of the colours during the first 5 moves (S11)', () => {
    useSettingsStore.setState({ playMoveHints: true, playLegend: true })
    render(<PlayPage />)
    fireEvent.click(screen.getByRole('button', { name: 'New game' }))
    const legend = screen.getByRole('list', { name: 'Colours' })
    expect(legend).toHaveTextContent('Best')
    expect(legend).toHaveTextContent('Blunder')
    act(() => usePlayStore.setState({ sans: Array(10).fill('e4') }))
    expect(screen.queryByRole('list', { name: 'Colours' })).toBeNull()
  })
  it('says how the last move was judged (S12)', () => {
    render(<PlayPage />)
    act(() => usePlayStore.setState({ status: 'playing', judgement: { ply: 1, san: 'e4', kind: 'book', loss: 0, opening: "King's Pawn Game (B00)" } }))
    expect(screen.getByTestId('move-status')).toHaveTextContent("e4: book move · King's Pawn Game (B00)")
    act(() => usePlayStore.setState({ judgement: { ply: 3, san: 'Qg4', kind: 'blunder', loss: 41.5 } }))
    expect(screen.getByTestId('move-status')).toHaveTextContent('Qg4: blunder (−41.5%)')
  })
  it('shows the players with ratings and the clocks of a Lichess game (S13)', () => {
    render(<PlayPage />)
    act(() => usePlayStore.setState({
      status: 'playing', mode: 'lichess-ai', color: 'white',
      players: { white: { name: 'Mandy', rating: 1650 }, black: { name: 'Lichess AI level 3' } },
      clocks: { white: 600000, black: 125000, increment: 5000, at: Date.now(), running: null },
      gameInfo: { speed: 'rapid', rated: false, url: 'https://lichess.org/g2' },
    }))
    expect(screen.getByTestId('player-white')).toHaveTextContent('Mandy (1650)')
    expect(screen.getByTestId('player-white')).toHaveTextContent('10:00')
    expect(screen.getByTestId('player-black')).toHaveTextContent('Lichess AI level 3')
    expect(screen.getByTestId('player-black')).toHaveTextContent('2:05')
    expect(screen.getByRole('link', { name: /rapid · casual/ })).toHaveAttribute('href', 'https://lichess.org/g2')
  })
  it('offers the Maia bots of Lichess as human-like opponents (S13)', () => {
    useSettingsStore.setState({ lichessToken: 'tok' })
    const start = vi.spyOn(usePlayStore.getState(), 'start').mockImplementation(() => {})
    render(<PlayPage />)
    fireEvent.change(screen.getByLabelText('Opponent'), { target: { value: 'lichess-bot' } })
    fireEvent.change(screen.getByLabelText('Bot'), { target: { value: 'maia9' } })
    fireEvent.click(screen.getByRole('button', { name: 'New game' }))
    expect(start).toHaveBeenCalledWith(expect.objectContaining({ mode: 'lichess-bot', bot: 'maia9', token: 'tok' }))
    start.mockRestore()
  })

  it('on my turn, says what a player of my rating would play (Maia, S7)', async () => {
    useSettingsStore.setState({ playHumanHint: true, playHumanRating: 1500 })
    render(<PlayPage />)
    fireEvent.click(screen.getByRole('button', { name: 'New game' }))
    expect(await screen.findByTestId('human-moves')).toHaveTextContent('A 1500 player would play: e4 (41%), d4 (32%)')
    useSettingsStore.setState({ playHumanHint: false })
  })

  it('can play a random colour (S6)', () => {
    const start = vi.spyOn(usePlayStore.getState(), 'start').mockImplementation(() => {})
    const rnd = vi.spyOn(Math, 'random').mockReturnValue(0.9)
    render(<PlayPage />)
    fireEvent.change(screen.getByLabelText('I play'), { target: { value: 'random' } })
    fireEvent.click(screen.getByRole('button', { name: 'New game' }))
    expect(start).toHaveBeenCalledWith(expect.objectContaining({ color: 'black' }))
    rnd.mockRestore(); start.mockRestore()
  })
  it('on my turn, shows ideas: the opening and the targets on the board (S3)', () => {
    useSettingsStore.setState({ playIdeas: true })
    render(<PlayPage />)
    act(() => usePlayStore.setState({ status: 'playing', mode: 'engine', color: 'white', sans: ['e4', 'e5', 'Nf3', 'Nc6', 'Bc4', 'Nd4'],
      fen: 'r1bqkbnr/pppp1ppp/8/4p3/2BnP3/5N2/PPPP1PPP/RNBQK2R w KQkq - 4 4' }))
    expect(screen.getByTestId('play-ideas')).toHaveTextContent('e5')
  })
  it('a trap I can set is written as a line that can be replayed, with info about the ideas (S5, S6)', async () => {
    const c = new Chess(); const keys = [positionHash(c.fen())]
    const sans = 'e4 e5 Bc4 Nc6 Qh5 Nf6 Qxf7#'.split(' ').map((m) => { const r = c.move(m); keys.push(positionHash(c.fen())); return r.san })
    const trap = { id: 's', title: "Scholar's mate", category: 'Classic', opening: 'Italian Game', side: 'white', trapMove: 3, setup: 4, fall: 4, tactic: 1, themes: [], intro: 'f7 is weak.', sans, keys, source: { title: 'Classic', author: null } }
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify([trap]), { status: 200 })))
    useSettingsStore.setState({ playIdeas: true })
    render(<PlayPage />)
    await act(async () => { await new Promise((r) => setTimeout(r, 0)) })
    act(() => usePlayStore.setState({ status: 'playing', mode: 'engine', color: 'white', sans: ['e4', 'e5'],
      fen: 'rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2' }))
    expect(await screen.findByTestId('play-trap-line-moves')).toHaveTextContent('2. Bc4 Nc6 3. Qh5 Nf6 4. Qxf7#')
    fireEvent.click(screen.getByRole('button', { name: 'Replay the line' }))
    expect(screen.getByTestId('play-trap-line-board')).toHaveTextContent('rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2')
    fireEvent.click(screen.getByText(/About these ideas/))
    expect(screen.getByTestId('play-info')).toHaveTextContent('The idea: f7 is weak.')
    vi.unstubAllGlobals()
    useSettingsStore.setState({ playIdeas: false })
  })

  it('traps by position: from a position one move away from a trap line, the move that leads into it is offered (S15)', async () => {
    const c = new Chess(); const keys = [positionHash(c.fen())]
    const sans = 'e4 e5 Bc4 Nc6 Qh5 Nf6 Qxf7#'.split(' ').map((m) => { const r = c.move(m); keys.push(positionHash(c.fen())); return r.san })
    const trap = { id: 's', title: "Scholar's mate", category: 'Classic', opening: 'Italian Game', side: 'white', trapMove: 3, setup: 4, fall: 4, tactic: 1, themes: [], intro: 'f7 is weak.', sans, keys, source: { title: 'Classic', author: null } }
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify([trap]), { status: 200 })))
    useSettingsStore.setState({ playIdeas: true })
    render(<PlayPage />)
    await act(async () => { await new Promise((r) => setTimeout(r, 0)) })
    // 1. e4 e5 2. Qh5 Nc6 — not on the trap's move order, but Bc4 now reaches its position after 3. Bc4 (… Nc6 Qh5 order).
    act(() => usePlayStore.setState({ status: 'playing', mode: 'engine', color: 'white', sans: ['e4', 'e5', 'Qh5', 'Nc6'],
      fen: 'r1bqkbnr/pppp1ppp/2n5/4p2Q/4P3/8/PPPP1PPP/RNB1KBNR w KQkq - 2 3' }))
    expect(await screen.findByTestId('play-trap-moves')).toHaveTextContent('Bc4')
    vi.unstubAllGlobals()
    useSettingsStore.setState({ playIdeas: false })
  })

  describe('study tools (S14)', () => {
    const flush = () => act(async () => { await new Promise((r) => setTimeout(r, 0)) })
    it('a repeated consecutive tutor comment shows its count on the same line (S14.5)', () => {
      render(<PlayPage />)
      act(() => usePlayStore.setState({ status: 'playing', log: [{ ply: 3, who: 'tutor', text: 'Possible: Nd5.', count: 3 }] }))
      expect(screen.getByRole('region', { name: 'Tutor' })).toHaveTextContent('Possible: Nd5. (3x)')
    })
    it('always shows the thinking time of both players, also without clocks (S14.6)', () => {
      const now = vi.spyOn(Date, 'now').mockReturnValue(20000)
      render(<PlayPage />)
      act(() => usePlayStore.setState({ status: 'playing', mode: 'engine', color: 'white', players: { white: { name: 'You' }, black: { name: 'Stockfish (3/8)' } },
        clocks: null, think: { white: 65000, black: 4000, turn: 'white', since: 15000 } }))
      expect(screen.getByTestId('think-white')).toHaveTextContent('1:10')
      expect(screen.getByTestId('think-black')).toHaveTextContent('0:04')
      now.mockRestore()
    })
    it('the tutor panel scrolls to the latest entry (S14.7)', () => {
      const h = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'scrollHeight')
      Object.defineProperty(HTMLElement.prototype, 'scrollHeight', { configurable: true, get: () => 900 })
      render(<PlayPage />)
      act(() => usePlayStore.setState({ status: 'playing', log: [{ ply: 1, who: 'tutor', text: 'One' }, { ply: 2, who: 'tutor', text: 'Two' }] }))
      expect(screen.getByRole('region', { name: 'Tutor' }).scrollTop).toBe(900)
      if (h) Object.defineProperty(HTMLElement.prototype, 'scrollHeight', h)
    })
    it('a tutor idea is shown briefly on the board, and hovering its move or squares shows them (S14.3)', () => {
      vi.useFakeTimers()
      const fen = 'rnb1kbnr/ppppqppp/8/8/8/2N5/PPPPPPPP/R1BQKBNR w KQkq - 0 1'
      render(<PlayPage />)
      act(() => usePlayStore.setState({ status: 'playing', mode: 'human', fen, log: [{ ply: 4, who: 'tutor', fen, text: 'Possible: Nd5. Double attack: the knight attacks the pawn on c7 and the queen on e7.' }] }))
      expect(screen.getByTestId('board-arrows')).toHaveTextContent('c3d5')
      expect(screen.getByTestId('board-squares').textContent).toMatch(/c7.*e7/)
      act(() => { vi.advanceTimersByTime(5000) })
      expect(screen.getByTestId('board-arrows')).toHaveTextContent('')
      fireEvent.mouseEnter(screen.getByText('queen on e7'))
      expect(screen.getByTestId('board-squares').textContent).toContain('e7')
      fireEvent.mouseLeave(screen.getByText('queen on e7'))
      fireEvent.mouseEnter(screen.getByText('Nd5'))
      expect(screen.getByTestId('board-arrows')).toHaveTextContent('c3d5')
      vi.useRealTimers()
    })
    it('shows the book comments of the current position with their source, for both sides or one (S14.2)', async () => {
      vi.mocked(lookupPositionComments).mockResolvedValue([{ text: 'The main line.', lang: 'en', ply: 1, san: 'e4', gameId: 'x', label: 'Game 3', source: { kind: 'book', title: 'My Predecessors', author: 'Garry Kasparov' } }])
      render(<PlayPage />)
      act(() => usePlayStore.setState({ status: 'playing', mode: 'engine', color: 'white', sans: ['e4'], fen: 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1' }))
      await flush()
      expect(screen.getByTestId('live-comments')).toHaveTextContent('The main line.')
      expect(screen.getByTestId('live-comments')).toHaveTextContent('Kasparov, My Predecessors, Game 3')
      // Only the opponent's moves: my e4 is not commented.
      fireEvent.change(screen.getByLabelText('Book comments'), { target: { value: 'opponent' } })
      await flush()
      expect(screen.queryByTestId('live-comments')).toBeNull()
      vi.mocked(lookupPositionComments).mockResolvedValue([])
    })
    it('suggests the moves the grandmasters of the books played here, with results and players (S14.1)', async () => {
      render(<PlayPage />)
      fireEvent.click(screen.getByLabelText('Play like a human grandmaster'))
      act(() => usePlayStore.setState({ status: 'playing', mode: 'engine', color: 'white' }))
      await flush(); await flush()
      const panel = await screen.findByTestId('gm-moves')
      expect(panel).toHaveTextContent('e4')
      expect(panel).toHaveTextContent('2 games')
      expect(panel).toHaveTextContent('Fischer – Tal 1-0')
      expect(panel).toHaveTextContent('Spassky – Petrosian 0-1')
    })
    it('touching a piece makes the tutor write what moving it implies (S14.8)', async () => {
      render(<PlayPage />)
      fireEvent.click(screen.getByRole('button', { name: 'New game' }))
      fireEvent.click(screen.getByRole('button', { name: 'sq-e2' }))
      await flush(); await flush()
      expect(screen.getByRole('region', { name: 'Tutor' })).toHaveTextContent(/Pawn on e2: e[34] \(.*reply e5\)/)
    })
    it('the colours of the chosen piece are computed while I think, before I pick it (S14.4)', async () => {
      useSettingsStore.setState({ playMoveHints: true })
      usePlayPrefs.setState({ explainTouch: false })
      render(<PlayPage />)
      fireEvent.click(screen.getByRole('button', { name: 'New game' }))
      for (let i = 0; i < 10; i++) await flush()
      fireEvent.click(screen.getByRole('button', { name: 'sq-e2' }))
      expect(screen.getByTestId('board-squares').textContent).toMatch(/e3.*e4/)
    })
  })
})

describe('PlayPage layout (S12, S13)', () => {
  const startWithBar = () => {
    useSettingsStore.setState({ playEvalBar: true })
    render(<PlayPage />)
    fireEvent.click(screen.getByRole('button', { name: 'New game' }))
  }
  const before = (a: Element, b: Element) => !!(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING)

  it('the eval bar sits beside a square board, at its height, on the left by default (S12)', () => {
    startWithBar()
    const bar = screen.getByTestId('play-eval-bar')
    const square = screen.getByTestId('play-board-square')
    expect(square.className).toContain('aspect-square')
    expect(bar.className).toContain('self-stretch')
    expect(screen.getByTestId('evalbar').dataset.direction).toBe('vertical')
    expect(before(bar, square)).toBe(true)
    expect(bar.parentElement).toBe(square.parentElement)
  })
  it('the eval bar position can be chosen: right, top, bottom, and is remembered (S12)', () => {
    startWithBar()
    const pos = screen.getByLabelText('Evaluation bar position')
    expect([...(pos as HTMLSelectElement).options].map((o) => o.textContent)).toEqual(['Left', 'Right', 'Top', 'Bottom'])
    fireEvent.change(pos, { target: { value: 'right' } })
    expect(before(screen.getByTestId('play-board-square'), screen.getByTestId('play-eval-bar'))).toBe(true)
    expect(screen.getByTestId('evalbar').dataset.direction).toBe('vertical')
    fireEvent.change(pos, { target: { value: 'top' } })
    expect(screen.getByTestId('evalbar').dataset.direction).toBe('horizontal')
    expect(before(screen.getByTestId('play-eval-bar'), screen.getByTestId('play-board-square'))).toBe(true)
    fireEvent.change(pos, { target: { value: 'bottom' } })
    expect(before(screen.getByTestId('play-board-square'), screen.getByTestId('play-eval-bar'))).toBe(true)
    expect(usePlayPrefs.getState().evalBarPosition).toBe('bottom')
  })
  it('the eval bar position labels follow the app language (S12)', () => {
    useSettingsStore.setState({ language: 'es' })
    render(<PlayPage />)
    const pos = screen.getByLabelText('Posición de la barra de evaluación') as HTMLSelectElement
    expect([...pos.options].map((o) => o.textContent)).toEqual(['Izquierda', 'Derecha', 'Arriba', 'Abajo'])
  })
  it('no eval bar while the option is off (regression)', () => {
    useSettingsStore.setState({ playEvalBar: false })
    render(<PlayPage />)
    fireEvent.click(screen.getByRole('button', { name: 'New game' }))
    expect(screen.queryByTestId('play-eval-bar')).toBeNull()
    expect(screen.getByTestId('play-board-square')).toBeInTheDocument()
  })
  it('the tutor panel can be resized with the keyboard on its handle, and the size is remembered (S13)', () => {
    render(<PlayPage />)
    const handle = screen.getByRole('separator', { name: 'Resize the tutor' })
    expect(handle).toHaveAttribute('aria-orientation', 'horizontal')
    expect(handle).toHaveAttribute('tabindex', '0')
    const start = Number(handle.getAttribute('aria-valuenow'))
    fireEvent.keyDown(handle, { key: 'ArrowDown' })
    expect(Number(handle.getAttribute('aria-valuenow'))).toBe(start + 40)
    expect(screen.getByRole('region', { name: 'Tutor' }).style.height).toBe(`${start + 40}px`)
    fireEvent.keyDown(handle, { key: 'ArrowUp' })
    fireEvent.keyDown(handle, { key: 'ArrowUp' })
    expect(usePlayPrefs.getState().tutorHeight).toBe(start - 40)
  })
  it('the tutor panel can be resized by dragging its handle with the mouse (S13)', () => {
    // jsdom has no PointerEvent: a MouseEvent carries the pointer's coordinates.
    if (typeof window.PointerEvent === 'undefined') vi.stubGlobal('PointerEvent', class extends MouseEvent {})
    render(<PlayPage />)
    const handle = screen.getByRole('separator', { name: 'Resize the tutor' })
    const start = Number(handle.getAttribute('aria-valuenow'))
    fireEvent.pointerDown(handle, { clientY: 500 })
    fireEvent.pointerMove(window, { clientY: 620 })
    fireEvent.pointerUp(window, { clientY: 620 })
    expect(usePlayPrefs.getState().tutorHeight).toBe(start + 120)
    fireEvent.pointerMove(window, { clientY: 900 })
    expect(usePlayPrefs.getState().tutorHeight).toBe(start + 120)
    vi.unstubAllGlobals()
  })
  it('the whole configuration can be folded and stays folded; New game stays at hand (S13)', () => {
    const { unmount } = render(<PlayPage />)
    const toggle = screen.getByRole('button', { name: 'Settings' })
    expect(toggle).toHaveAttribute('aria-expanded', 'true')
    fireEvent.click(toggle)
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByLabelText('Opponent')).toBeNull()
    expect(screen.queryByLabelText('I play')).toBeNull()
    expect(screen.queryByRole('group', { name: 'Options' })).toBeNull()
    expect(screen.getByRole('button', { name: 'New game' })).toBeInTheDocument()
    expect(usePlayPrefs.getState().configCollapsed).toBe(true)
    unmount()
    render(<PlayPage />)
    expect(screen.queryByLabelText('Opponent')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Settings' }))
    expect(screen.getByLabelText('Opponent')).toBeInTheDocument()
  })
  it('a game can be started while the configuration is folded, with the chosen opponent (regression)', () => {
    render(<PlayPage />)
    fireEvent.change(screen.getByLabelText('Engine strength'), { target: { value: '5' } })
    fireEvent.click(screen.getByRole('button', { name: 'Settings' }))
    fireEvent.click(screen.getByRole('button', { name: 'New game' }))
    expect(usePlayStore.getState()).toMatchObject({ status: 'playing', strength: 5, mode: 'engine' })
  })
})
