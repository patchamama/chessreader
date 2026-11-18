import { describe, it, expect } from 'vitest'
import { recognizeGames } from '../../recognition/recognizeGames.js'

describe('a FEN is never renumbered backwards', () => {
  // Kasparov III: an analysis FEN numbered "0 15" inside a note; a later game
  // move "13…Nd7!" happens to be legal from it, and must not drag the FEN back to 13.
  it('keeps the move number the FEN states when the next paragraph move has a smaller one', () => {
    const fen = 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 15'
    const text = ['Una posición de análisis:', fen, '13…Nc6! y las negras siguen.'].join('\n')
    const fromFen = recognizeGames(text, { algorithm: 2 }).filter((x) => x.tree.startFen.startsWith('rnbqkbnr/pppppppp/8/8/4P3'))
    for (const g of fromFen) expect(g.tree.startFen).toBe(fen)
    expect(fromFen.some((g) => g.tree.startFen.endsWith(' 13'))).toBe(false)
  })

  it('still renumbers forwards from a FEN without move counters', () => {
    const text = ['3b4/pp6/8/8/2k1K1P1/2p5/P3N2P/8 w - -', '41 Kf5 Kd3 42 Nxc3'].join('\n')
    const g = recognizeGames(text, { algorithm: 2 })[0]
    expect(g.tree.startFen).toBe('3b4/pp6/8/8/2k1K1P1/2p5/P3N2P/8 w - - 0 41')
  })
})
