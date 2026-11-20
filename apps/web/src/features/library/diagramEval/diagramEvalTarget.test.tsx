import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'

// llm-assistant-round S14: "Evaluate this diagram" evaluates the position after
// the last main-line move before it, asks main line or variation when a
// variation comes just before it, and says which move it evaluates while it works.

const evaluate = vi.hoisted(() => ({ calls: [] as string[], release: null as null | (() => void) }))
vi.mock('./diagramEvalStore', async (importOriginal) => {
  const real = await importOriginal<typeof import('./diagramEvalStore')>()
  return {
    ...real,
    evaluateDiagram: vi.fn((fen: string) => {
      evaluate.calls.push(fen)
      return new Promise<void>((resolve) => { evaluate.release = resolve })
    }),
  }
})
vi.mock('../../viewer/components/EvalBar', () => ({ default: () => <div /> }))

import { DiagramEvalFooter } from './DiagramEvalFooter'
import { useSettingsStore } from '../../../shared/settings/settingsStore'

const MAIN_FEN = 'rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2'
const VAR_FEN = 'rnbqkbnr/pppp1ppp/8/8/3pP3/8/PPP2PPP/RNBQKBNR w KQkq - 0 3'
const main = { fen: MAIN_FEN, san: 'e5', moveNumber: 1, color: 'black' as const }
const variation = { fen: VAR_FEN, san: 'exd4', moveNumber: 2, color: 'black' as const }

beforeEach(() => {
  evaluate.calls = []
  useSettingsStore.setState({ language: 'en', notationStyle: 'letters' })
})

describe('the diagram is evaluated after the right move (S14)', () => {
  it('evaluates the position after the last main-line move and names that move while it works', async () => {
    render(<DiagramEvalFooter fen={MAIN_FEN} main={main} />)
    fireEvent.click(screen.getByRole('button', { name: 'Evaluate this diagram' }))
    expect(evaluate.calls).toEqual([MAIN_FEN])
    expect(screen.getByTestId('diagram-eval-target')).toHaveTextContent('after 1...e5')
    evaluate.release?.()
    await waitFor(() => expect(screen.queryByTestId('diagram-eval-target')).toBeNull())
  })

  it('asks main line or variation when a variation comes just before the diagram', async () => {
    render(<DiagramEvalFooter fen={MAIN_FEN} main={main} variation={variation} />)
    fireEvent.click(screen.getByRole('button', { name: 'Evaluate this diagram' }))
    expect(evaluate.calls).toEqual([])
    fireEvent.click(screen.getByRole('button', { name: /variation.*2\.\.\.exd4/i }))
    expect(evaluate.calls).toEqual([VAR_FEN])
    expect(screen.getByTestId('diagram-eval-target')).toHaveTextContent('after 2...exd4')
  })

  it('a diagram with the book\'s own FEN evaluates that position and says so', () => {
    const bookFen = '8/8/8/8/8/8/k7/K7 w - - 0 40'
    render(<DiagramEvalFooter fen={bookFen} main={main} />)
    fireEvent.click(screen.getByRole('button', { name: 'Evaluate this diagram' }))
    expect(evaluate.calls).toEqual([bookFen])
    expect(screen.getByTestId('diagram-eval-target')).toHaveTextContent(/book.*FEN/i)
  })
})
