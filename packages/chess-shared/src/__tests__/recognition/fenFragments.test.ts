import { describe, it, expect } from 'vitest'
import { recognizeGames } from '../../recognition/recognizeGames.js'

const sans = (g: ReturnType<typeof recognizeGames>[number]) => g.tree.mainline.map((id) => g.tree.nodes.get(id)!.san)

describe('a game that starts from a FEN written in the text (S1)', () => {
  const text = [
    'Partida 301',
    'T. Petrosian-S. Gligoric',
    'Olimpiada de Varna 1962',
    '5rk1/1pp5/r5bp/p1nPp1q1/2P2p2/2N5/PP1QBRPP/5R1K w - - 0 26',
    '￼',
    'Stockfish 14 eval: [-0.43] 26 g3 Ce4 27 Cxe4 Axe4+',
    '26 De3 Ah5 27 Cd1',
    'Las blancas reagrupan sus piezas.',
    '27…Cd3 28 Tf3',
    'Partida 302',
    '1 d4 Cf6 2 c4 e6',
  ].join('\n')
  const games = recognizeGames(text, { algorithm: 2 })

  it('reads the fragment from the position of the FEN, numbered as the FEN says', () => {
    expect(games).toHaveLength(2)
    expect(games[0].tree.startFen).toBe('5rk1/1pp5/r5bp/p1nPp1q1/2P2p2/2N5/PP1QBRPP/5R1K w - - 0 26')
    expect(sans(games[0])).toEqual(['Qe3', 'Bh5', 'Nd1', 'Nd3', 'Rf3'])
    expect(games[0].tree.nodes.get(games[0].tree.mainline[0])!.moveNumber).toBe(26)
    expect(games[0].tree.errors).toEqual([])
  })

  it('the engine line after the FEN is a variation from that position', () => {
    const tree = games[0].tree
    const g3 = [...tree.nodes.values()].find((n) => n.san === 'g3')
    expect(g3).toBeDefined()
    expect(tree.mainline).not.toContain(g3!.id)
  })

  it('the next game starts from the initial position again', () => {
    expect(sans(games[1])).toEqual(['d4', 'Nf6', 'c4', 'e6'])
  })

  it('a malformed FEN-like line is plain text', () => {
    const g = recognizeGames('5rk1/1pp5/r5bp w - - 0 26\n1 e4 e5', { algorithm: 2 })
    expect(sans(g[0])).toEqual(['e4', 'e5'])
  })

  it('a FEN with a rook next to a square-like letter is kept as written', () => {
    const g = recognizeGames('6k1/5ppp/8/8/8/8/5PPP/1Rb3K1 w - - 0 30\n30 Txc1', { algorithm: 2 })
    expect(g[0].tree.startFen).toBe('6k1/5ppp/8/8/8/8/5PPP/1Rb3K1 w - - 0 30')
    expect(sans(g[0])).toEqual(['Rxc1'])
  })
})
