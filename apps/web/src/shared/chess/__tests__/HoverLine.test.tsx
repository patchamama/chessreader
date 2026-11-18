import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { HoverLine } from '../HoverLine'
import { playLine } from '../playLine'
import { useSettingsStore } from '../../settings/settingsStore'

vi.mock('../ChessBoard', () => ({ default: () => <div data-testid="board" /> }))

const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'

beforeEach(() => useSettingsStore.setState({ language: 'es', notationStyle: 'letters', diagramEvalThumbs: false }))

describe('HoverLine notation (S12)', () => {
  it('rewrites a line written with Spanish letters as figurines, from the moves it plays', () => {
    useSettingsStore.setState({ notationStyle: 'figurine' })
    const { positions } = playLine(START, ['e4', 'e5', 'Nf3', 'Nc6', 'Bb5'])
    render(<HoverLine text="1. e4 e5 2. Cf3 Cc6 3. Ab5" positions={positions} testId="line" />)
    expect(screen.getByTestId('line')).toHaveTextContent('1. e4 e5 2. ♞f3 ♞c6 3. ♝b5')
  })

  it('writes English SAN with the letters of the language', () => {
    const { positions } = playLine(START, ['Nf3', 'd5'])
    render(<HoverLine text="1. Nf3 d5" positions={positions} testId="line" />)
    expect(screen.getByTestId('line')).toHaveTextContent('1. Cf3 d5')
  })
})
