import { describe, it, expect, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { capturedPiece } from '../capturedPiece'
import { playLine } from '../playLine'
import { HoverLine } from '../HoverLine'
import { useSettingsStore } from '../../settings/settingsStore'

// llm-assistant-round S13: a thumbnail of a capture shows which piece left the board.

vi.mock('../ChessBoard', () => ({ default: ({ fen }: { fen: string }) => <div data-testid="thumb">{fen}</div> }))

const BEFORE = 'r1bqkbnr/pppp1ppp/2n5/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 2 3'

describe('capturedPiece', () => {
  it('names the piece the move took (case = its colour)', () => {
    const after = playLine('rnbqkbnr/pppp1ppp/8/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 0 2', ['Nxe5']).positions[0].fen
    expect(capturedPiece('rnbqkbnr/pppp1ppp/8/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 0 2', after)).toBe('p')
  })

  it('is null for a quiet move and for a promotion without capture', () => {
    const after = playLine(BEFORE, ['Bb5']).positions[0].fen
    expect(capturedPiece(BEFORE, after)).toBeNull()
    expect(capturedPiece('8/P6k/8/8/8/8/8/K7 w - - 0 1', 'Q7/7k/8/8/8/8/8/K7 b - - 0 1')).toBeNull()
  })

  it('finds a white piece taken by Black', () => {
    const fen = 'rnbqkbnr/ppp1pppp/8/3p4/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 2'
    expect(capturedPiece(fen, playLine(fen, ['dxe4']).positions[0].fen)).toBe('P')
  })
})

describe('a line\'s thumbnails show the captured piece', () => {
  it('playLine keeps the captured piece of each move', () => {
    const { positions } = playLine('rnbqkbnr/pppp1ppp/8/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 0 2', ['Nxe5', 'Nc6'])
    expect(positions.map((p) => p.captured ?? null)).toEqual(['p', null])
  })

  it('HoverLine shows the taken piece on the thumbnail of a capture', () => {
    useSettingsStore.setState({ diagramEvalThumbs: true, language: 'en', notationStyle: 'letters' })
    const start = 'rnbqkbnr/pppp1ppp/8/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 0 2'
    render(<HoverLine text="2. Nxe5 Nc6" positions={playLine(start, ['Nxe5', 'Nc6']).positions} />)
    fireEvent.mouseEnter(screen.getByText('Nxe5'))
    expect(screen.getByTestId('captured-piece')).toHaveTextContent('♟')
    fireEvent.mouseLeave(screen.getByText('Nxe5'))
    fireEvent.mouseEnter(screen.getByText('Nc6'))
    expect(screen.queryByTestId('captured-piece')).toBeNull()
  })
})
