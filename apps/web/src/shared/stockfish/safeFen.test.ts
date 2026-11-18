import { describe, expect, it } from 'vitest'
import { engineSafeFen } from './safeFen'

describe('positions the engine can take (an impossible one crashes Stockfish: "RuntimeError: unreachable")', () => {
  it('accepts a legal position', () => {
    expect(engineSafeFen('rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1')).toBe(true)
  })
  it('refuses a broken FEN, a missing king, and the side that just moved left in check', () => {
    expect(engineSafeFen('not a fen')).toBe(false)
    expect(engineSafeFen('8/8/8/8/8/8/8/4K3 w - - 0 1')).toBe(false)
    // Black to move but White is in check from the rook: impossible.
    expect(engineSafeFen('4k3/8/8/8/8/8/8/r3K3 b - - 0 1')).toBe(false)
    expect(engineSafeFen(null)).toBe(false)
  })
})
