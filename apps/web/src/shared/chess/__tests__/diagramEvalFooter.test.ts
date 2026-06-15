import { describe, it, expect } from 'vitest'
import { formatEngineName, scoreFromWhitePov, formatDiagramEvalFooter } from '../diagramEvalFooter'

describe('formatEngineName', () => {
  it('abbreviates "Stockfish 18" to "SF18"', () => {
    expect(formatEngineName('Stockfish 18')).toBe('SF18')
  })

  it('abbreviates "Stockfish 16.1" to "SF16.1"', () => {
    expect(formatEngineName('Stockfish 16.1')).toBe('SF16.1')
  })

  it('falls back to "SF" when no version is present', () => {
    expect(formatEngineName('Stockfish')).toBe('SF')
  })

  it('falls back to "SF" for null/undefined', () => {
    expect(formatEngineName(undefined)).toBe('SF')
    expect(formatEngineName(null)).toBe('SF')
  })
})

describe('scoreFromWhitePov', () => {
  const whiteToMove = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'
  const blackToMove = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR b KQkq - 0 1'

  it('keeps the score as-is when white is to move', () => {
    expect(scoreFromWhitePov({ scoreCp: 130 }, whiteToMove)).toEqual({ scoreCp: 130 })
  })

  it('negates the score when black is to move (engine reports side-to-move POV)', () => {
    expect(scoreFromWhitePov({ scoreCp: 130 }, blackToMove)).toEqual({ scoreCp: -130 })
  })

  it('negates mate too when black is to move', () => {
    expect(scoreFromWhitePov({ mate: 3 }, blackToMove)).toEqual({ mate: -3 })
  })
})

describe('formatDiagramEvalFooter', () => {
  const whiteToMove = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'

  it('builds "SF18: (1.30) 1. ♞f3 ..." for a white-to-move cp eval', () => {
    const footer = formatDiagramEvalFooter(
      { scoreCp: 130, pv: ['g1f3', 'b8c6'], engineName: 'Stockfish 18' },
      whiteToMove,
    )
    expect(footer).toBe('SF18: (1.30) 1. ♞f3 ♞c6')
  })

  it('labels a black-to-move PV with "N... move" and white-POV score', () => {
    // King-and-queen endgame, black to move; pick a simple legal position.
    const fen = '8/8/8/8/8/5k2/Q7/5K2 b - - 0 60'
    const footer = formatDiagramEvalFooter(
      { scoreCp: -1100, pv: ['f3e3'], engineName: 'Stockfish 18' },
      fen,
    )
    // black to move => score negated to white POV => (11.00); move labelled "60..."
    expect(footer.startsWith('SF18: (11.00) 60... ')).toBe(true)
  })

  it('renders mate score', () => {
    const footer = formatDiagramEvalFooter(
      { mate: 2, pv: ['d1h5'], engineName: 'Stockfish 18' },
      whiteToMove,
    )
    expect(footer.startsWith('SF18: (#2) ')).toBe(true)
  })

  it('omits the PV gracefully when absent', () => {
    const footer = formatDiagramEvalFooter(
      { scoreCp: 50, engineName: 'Stockfish 18' },
      whiteToMove,
    )
    expect(footer).toBe('SF18: (0.50)')
  })
})
