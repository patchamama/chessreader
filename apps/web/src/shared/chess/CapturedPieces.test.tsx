import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { CapturedPieces, materialBalance } from './CapturedPieces'

const AFTER_EXD5 = 'rnbqkbnr/ppp1pppp/8/3P4/8/8/PPPP1PPP/RNBQKBNR b KQkq - 0 2'

describe('materialBalance', () => {
  it('counts pawn 1, knight/bishop 3, rook 5, queen 9: positive when White is ahead', () => {
    expect(materialBalance(AFTER_EXD5)).toBe(1)
    expect(materialBalance('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1')).toBe(0)
    expect(materialBalance('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBN1 w Qkq - 0 1')).toBe(-5)
  })
})

describe('CapturedPieces', () => {
  it('shows the pieces a side has taken as small figurines, with the lead next to the side that is ahead', () => {
    render(<CapturedPieces fen={AFTER_EXD5} side="white" />)
    const strip = screen.getByTestId('captured-white')
    expect(strip.textContent).toContain('♟')
    expect(strip.textContent).toContain('+1')
  })

  it('shows nothing for the side that has taken nothing and no lead for the one behind', () => {
    render(<CapturedPieces fen={AFTER_EXD5} side="black" />)
    const strip = screen.getByTestId('captured-black')
    expect(strip.textContent).toBe('')
  })
})
