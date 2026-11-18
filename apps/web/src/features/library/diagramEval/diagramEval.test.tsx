import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { evaluateDiagram, evaluateDiagrams, evaluatePosition, useDiagramEvalStore } from './diagramEvalStore'
import { diagramEvalText } from './diagramEvalText'
import { DiagramEvalFooter } from './DiagramEvalFooter'
import { setReviewEngine } from '../review/reviewStore'
import { useSettingsStore } from '../../../shared/settings/settingsStore'
import { useAuthStore } from '../../auth/store/authStore'

vi.mock('../../../shared/chess/ChessBoard', () => ({ default: ({ fen }: { fen: string }) => <div data-testid="thumb">{fen}</div> }))
vi.mock('../../viewer/components/EvalBar', () => ({ default: ({ score }: { score?: { scoreCp?: number } }) => <div data-testid="evalbar">{score?.scoreCp}</div> }))

// After 1. e4 e5 2. Nf3 Nc6: White to move.
const FEN = 'r1bqkbnr/pppp1ppp/2n5/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 2 3'
const LINES = [
  { idx: 1, depth: 16, scoreCp: 44, pv: ['d2d4', 'e5d4', 'f3d4'] },
  { idx: 2, depth: 16, scoreCp: 37, pv: ['f1b5', 'a7a6'] },
  { idx: 3, depth: 16, scoreCp: 24, pv: ['b1c3', 'g8f6'] },
]

beforeEach(() => {
  useDiagramEvalStore.setState({ byFen: {} })
  useSettingsStore.getState().reset()
  useSettingsStore.setState({ language: 'es' })
  useAuthStore.setState({ token: null })
})
afterEach(() => { vi.unstubAllGlobals(); setReviewEngine(null) })

describe('evaluatePosition (S3)', () => {
  it('asks the server for several lines when there is one', async () => {
    useAuthStore.setState({ token: 'jwt' })
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ depth: 16, scoreCp: 44, engineName: 'Stockfish 19', lines: [
      { depth: 16, scoreCp: 44, pv: ['d2d4', 'e5d4'], engineName: 'Stockfish 19' }, { depth: 16, mate: 5, pv: ['f1b5'], engineName: 'Stockfish 19' },
    ] }), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)
    const r = await evaluatePosition(FEN, 16, 3)
    expect(r).toMatchObject({ engine: 'Stockfish 19', depth: 16, lines: [{ pv: ['d2d4', 'e5d4'], scoreCp: 44 }, { pv: ['f1b5'], mate: 5 }] })
    expect(JSON.parse(String((fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].body))).toEqual({ fen: FEN, depth: 16, lines: 3 })
  })

  it('without a server, the engine of the browser answers', async () => {
    setReviewEngine(async () => LINES)
    const r = await evaluatePosition(FEN, 16, 3)
    expect(r.lines.map((l) => l.pv[0])).toEqual(['d2d4', 'f1b5', 'b1c3'])
    expect(r.engine).toBe('Stockfish 18 lite')
  })
})

describe('evaluateDiagrams (S3)', () => {
  it('adds an evaluation only where a diagram has none, or replaces them all', async () => {
    const asked: string[] = []
    setReviewEngine(async (fen) => { asked.push(fen); return LINES })
    const other = 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1'
    useDiagramEvalStore.getState().put(FEN, { engine: 'old', depth: 8, lines: [{ pv: ['h2h3'], scoreCp: 0 }], at: 1 })
    await evaluateDiagrams([FEN, other], 'missing')
    expect(asked).toEqual([other])
    await evaluateDiagrams([FEN, other], 'replace')
    expect(asked).toEqual([other, FEN, other])
    expect(useDiagramEvalStore.getState().get(FEN)?.lines[0].pv[0]).toBe('d2d4')
  })
})

describe('DiagramEvalFooter (S3)', () => {
  it('writes the evaluation as books print it: who is better, the engine, its line and two alternatives', () => {
    useDiagramEvalStore.getState().put(FEN, { engine: 'Stockfish 19', depth: 16, lines: LINES.map(({ pv, scoreCp }) => ({ pv, scoreCp })), at: 1 })
    render(<DiagramEvalFooter fen={FEN} />)
    expect(screen.getByTestId('diagram-eval-words')).toHaveTextContent('Evaluación: +0.4 (igualdad) · Stockfish 19, prof. 16')
    expect(screen.getByTestId('diagram-eval-line')).toHaveTextContent('3. d4 exd4 4. Cxd4')
    expect(screen.getAllByTestId('diagram-eval-alt').map((e) => e.textContent)).toEqual(['3. Ab5 a6 (+0.4)', '3. Cc3 Cf6 (+0.2)'])
  })

  it('each move of the engine line shows its position on hover (S7)', () => {
    useDiagramEvalStore.getState().put(FEN, { engine: 'Stockfish 19', depth: 16, lines: LINES.map(({ pv, scoreCp }) => ({ pv, scoreCp })), at: 1 })
    render(<DiagramEvalFooter fen={FEN} />)
    const moves = document.querySelectorAll('[data-testid="diagram-eval-line"] [data-move-thumb]')
    expect([...moves].map((m) => m.textContent)).toEqual(['d4', 'exd4', 'Cxd4'])
    fireEvent.mouseEnter(moves[2])
    expect(screen.getByTestId('thumb')).toHaveTextContent('r1bqkbnr/pppp1ppp/2n5/8/3NP3/8/PPP2PPP/RNBQKB1R b KQkq - 0 4')
  })

  it('a refresh button evaluates the diagram again and replaces its evaluation', async () => {
    useDiagramEvalStore.getState().put(FEN, { engine: 'old', depth: 8, lines: [{ pv: ['h2h3'], scoreCp: 0 }], at: 1 })
    setReviewEngine(async () => LINES)
    render(<DiagramEvalFooter fen={FEN} />)
    fireEvent.click(screen.getByRole('button', { name: 'Volver a evaluar este diagrama' }))
    await waitFor(() => expect(screen.getByTestId('diagram-eval-line')).toHaveTextContent('3. d4'))
  })

  it('a diagram without evaluation offers to evaluate it, and the bar shows when chosen', async () => {
    useSettingsStore.setState({ diagramEvalBar: true })
    setReviewEngine(async () => LINES)
    render(<DiagramEvalFooter fen={FEN} />)
    fireEvent.click(screen.getByRole('button', { name: 'Evaluar este diagrama' }))
    await waitFor(() => expect(screen.getByTestId('evalbar')).toHaveTextContent('44'))
  })
})

describe('engine chosen in Settings (S2, S3)', () => {
  it('evaluateDiagram with the Settings engine asks the browser engine even when there is a server', async () => {
    useAuthStore.setState({ token: 'jwt' })
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    setReviewEngine(async () => LINES)
    const e = await evaluateDiagram(FEN, { engine: 'settings' })
    expect(fetchMock).not.toHaveBeenCalled()
    expect(e.engine).toBe('Stockfish 18 lite')
    expect(useDiagramEvalStore.getState().get(FEN)?.lines[0].pv[0]).toBe('d2d4')
  })

  it('the refresh icon of the footer is a small icon and re-runs the evaluation with the Settings engine', async () => {
    useAuthStore.setState({ token: 'jwt' })
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    useDiagramEvalStore.getState().put(FEN, { engine: 'old', depth: 8, lines: [{ pv: ['h2h3'], scoreCp: 0 }], at: 1 })
    setReviewEngine(async () => LINES)
    render(<DiagramEvalFooter fen={FEN} />)
    const button = screen.getByRole('button', { name: 'Volver a evaluar este diagrama' })
    expect(button.querySelector('svg')).toBeTruthy()
    expect(button.textContent).toBe('')
    fireEvent.click(button)
    await waitFor(() => expect(screen.getByTestId('diagram-eval-line')).toHaveTextContent('3. d4'))
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

describe('diagramEvalText (S3)', () => {
  it('is the evaluation as the footer prints it: words, engine line and alternatives', () => {
    const e = { engine: 'Stockfish 19', depth: 16, lines: LINES.map(({ pv, scoreCp }) => ({ pv, scoreCp })), at: 1 }
    expect(diagramEvalText(FEN, e, 'es')).toBe(
      'Evaluación: +0.4 (igualdad) · Stockfish 19, prof. 16\n3. d4 exd4 4. Cxd4\n3. Ab5 a6 (+0.4)\n3. Cc3 Cf6 (+0.2)\n',
    )
  })

  it('a position the engine could not evaluate says so', () => {
    expect(diagramEvalText(FEN, { engine: 'Stockfish', depth: 0, lines: [], at: 1 }, 'en')).toBe('No evaluation\n')
  })
})
