import { render, screen } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import EvalBar from '../components/EvalBar'

vi.mock('../../../shared/stockfish/useStockfishEval', () => ({
  useStockfishEval: vi.fn(),
}))

vi.mock('../../../shared/settings/settingsStore', () => ({
  useSettingsStore: vi.fn((sel: (s: { evalBarDirection: string }) => unknown) =>
    sel({ evalBarDirection: 'horizontal' })
  ),
}))

import { useStockfishEval } from '../../../shared/stockfish/useStockfishEval'
const mockUseStockfishEval = useStockfishEval as ReturnType<typeof vi.fn>

const STARTPOS = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'

describe('EvalBar', () => {
  it('renders positive cp eval as +1.3', () => {
    mockUseStockfishEval.mockReturnValue({ loading: false, scoreCp: 130, depth: 15 })
    render(<EvalBar fen={STARTPOS} />)
    expect(screen.getByText('+1.3')).toBeInTheDocument()
  })

  it('renders negative cp eval as -0.5', () => {
    mockUseStockfishEval.mockReturnValue({ loading: false, scoreCp: -50, depth: 15 })
    render(<EvalBar fen={STARTPOS} />)
    expect(screen.getByText('-0.5')).toBeInTheDocument()
  })

  it('renders zero eval as 0.0', () => {
    mockUseStockfishEval.mockReturnValue({ loading: false, scoreCp: 0, depth: 15 })
    render(<EvalBar fen={STARTPOS} />)
    expect(screen.getByText('0.0')).toBeInTheDocument()
  })

  it('renders mate as +M3', () => {
    mockUseStockfishEval.mockReturnValue({ loading: false, mate: 3, depth: 5 })
    render(<EvalBar fen={STARTPOS} />)
    expect(screen.getByText('+M3')).toBeInTheDocument()
  })

  it('renders opponent mate as -M2', () => {
    mockUseStockfishEval.mockReturnValue({ loading: false, mate: -2, depth: 5 })
    render(<EvalBar fen={STARTPOS} />)
    expect(screen.getByText('-M2')).toBeInTheDocument()
  })
})
