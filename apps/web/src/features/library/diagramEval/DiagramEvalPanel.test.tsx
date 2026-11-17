import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { DiagramEvalPanel } from './DiagramEvalPanel'
import { useDiagramEvalStore } from './diagramEvalStore'
import { setReviewEngine } from '../review/reviewStore'
import { useSettingsStore } from '../../../shared/settings/settingsStore'

const A = 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1'
const B = 'rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2'

beforeEach(() => {
  useDiagramEvalStore.setState({ byFen: {} })
  useSettingsStore.setState({ language: 'en' })
})
afterEach(() => setReviewEngine(null))

describe('DiagramEvalPanel (S3)', () => {
  it('evaluates the diagrams that have none, then all of them again on request', async () => {
    const asked: string[] = []
    setReviewEngine(async (fen) => { asked.push(fen); return [{ idx: 1, depth: 16, scoreCp: 20, pv: ['g1f3'] }] })
    useDiagramEvalStore.getState().put(A, { engine: 'x', depth: 8, lines: [{ pv: ['e7e5'], scoreCp: 0 }], at: 1 })
    render(<DiagramEvalPanel fens={[A, B]} />)
    expect(screen.getByText(/2 diagrams in this chapter · 1 evaluated/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Add where missing' }))
    await waitFor(() => expect(screen.getByText(/2 evaluated/)).toBeInTheDocument())
    expect(asked).toEqual([B])
    fireEvent.click(screen.getByRole('button', { name: 'Replace all' }))
    await waitFor(() => expect(asked).toEqual([B, A, B]))
  })
})
