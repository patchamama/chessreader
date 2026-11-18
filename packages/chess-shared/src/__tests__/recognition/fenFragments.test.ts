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

describe('a FEN on its own line starts a new game numbered as the moves after it (S7)', () => {
  // "Mis geniales predecesores I", Capítulo dos, Partida 39: the FEN says move 1
  // (and so does the engine line), the book goes on at its own move 41.
  const P39 = [
    '1 e4 e5 2 Cf3 Cc6',
    'Partida 39',
    'S. Tarrasch-E. Lasker',
    'Hastings 1895, 19ª ronda',
    '3b4/pp6/8/8/2k1K1P1/2p5/P3N2P/8 w - - 0 1',
    '￼',
    'Stockfish 13 eval: [-0.38] 1 Cxc3 Rxc3 2 Rf5 b5 3 g5 Axg5 4 Rxg5 b4 5 h4 Rb2',
    '41 Rf5?!',
    '¡Un movimiento desesperado! Después de 41 Cd4 b5 42 Cc2 b4 43 Ce3+ Rc5, el alfil es más fuerte que el caballo.',
    '41…Rd3??',
    '42 Cxc3!',
  ].join('\n')
  // Partida 46: the FEN says move 21, the book goes on at 22 (its "22 Aa6" is the engine's "21 Aa6").
  const P46 = [
    'Partida 46',
    'S. Tarrasch-I. Gunsberg',
    'Francfort 1887',
    '5º Congreso de la Asociación Alemana',
    'k1br3r/ppq3pp/2p1pp1n/2P5/3P4/1R1B1N1P/P2Q1PP1/1R4K1 w - - 0 21',
    '￼',
    'Stockfish 13 eval: [+2.44] 21 Aa6 Td5 22 Axb7+ Axb7 23 Txb7 Dxb7 24 Txb7 Rxb7 25 De1 Rc7',
    'Esta posición se produjo en una Defensa Francesa, con la jugada 3…dxe4, censurada por Tarrasch.',
    '22 Tb6!',
    'Tarrasch consideró y descartó la inesperada 22 Aa6?! bxa6? 23 Da5! Df4 24 g3 + debido a que las negras podían neutralizarla.',
    '22…e5!',
  ].join('\n')

  it('Partida 39: a new game from the FEN, its moves continue from it at move 41', () => {
    const games = recognizeGames(P39, { algorithm: 2 })
    expect(games).toHaveLength(2)
    expect(sans(games[0])).toEqual(['e4', 'e5', 'Nf3', 'Nc6'])
    const g = games[1]
    expect(g.tree.startFen).toBe('3b4/pp6/8/8/2k1K1P1/2p5/P3N2P/8 w - - 0 41')
    expect(sans(g)).toEqual(['Kf5', 'Kd3', 'Nxc3'])
    expect(g.tree.nodes.get(g.tree.mainline[0])!.moveNumber).toBe(41)
    // The engine line and the remark's line are variations from the FEN.
    const alt = [...g.tree.nodes.values()].filter((n) => !g.tree.mainline.includes(n.id)).map((n) => n.san)
    expect(alt).toContain('Nd4')
    expect(alt.filter((s) => s === 'Nxc3').length).toBeGreaterThan(0)
    expect(g.tree.errors).toEqual([])
  })

  it('Partida 46: the moves continue from the FEN at move 22', () => {
    const [g] = recognizeGames(P46, { algorithm: 2 })
    expect(g.tree.startFen).toBe('k1br3r/ppq3pp/2p1pp1n/2P5/3P4/1R1B1N1P/P2Q1PP1/1R4K1 w - - 0 22')
    expect(sans(g)).toEqual(['Rb6', 'e5'])
    expect(g.tree.nodes.get(g.tree.mainline[0])!.moveNumber).toBe(22)
    expect([...g.tree.nodes.values()].some((n) => n.san === 'Ba6' && !g.tree.mainline.includes(n.id))).toBe(true)
  })

  it('Partida 46 in the chapter: an engine line keeps its bracket though a ")" closes an earlier "(" later on', () => {
    // The game before leaves a "(" open in its analysis; a later list item "1)" closes it.
    const text = [
      '1 e4 e5 2 Cf3 Cc6',
      'Era preciso la activa 24 a3! a5 (24…Re7 25 b4; después de 24…Re6, entonces no 25 b4?! Re5!',
      '0-1',
      P46,
      '23 R1b4 The8',
      'Lo lógico es 9 Cc3 h6, con las siguientes posibilidades:',
      '1) 10 b3',
    ].join('\n')
    const g = recognizeGames(text, { algorithm: 2 }).find((x) => x.tree.startFen.startsWith('k1br3r'))!
    expect(g.tree.startFen).toBe('k1br3r/ppq3pp/2p1pp1n/2P5/3P4/1R1B1N1P/P2Q1PP1/1R4K1 w - - 0 22')
    expect(sans(g).slice(0, 2)).toEqual(['Rb6', 'e5'])
  })

  it('moves that cannot follow the FEN keep the current reading', () => {
    // "41 Rf5" is not a move of this position: the FEN keeps its own number.
    const games = recognizeGames('3b4/pp6/8/8/2k1K1P1/2p5/P3N2P/8 w - - 0 1\n41 Rb5 Rd3', { algorithm: 2 })
    expect(games.every((g) => g.tree.startFen !== '3b4/pp6/8/8/2k1K1P1/2p5/P3N2P/8 w - - 0 41')).toBe(true)
  })
})

describe('a game ends at its last move, not at the next heading (S7)', () => {
  it('the heading of the next game is outside the span of the previous one', () => {
    const text = [
      '1 f4 d5 2 e3 Cf6',
      'Era precisa.',
      'Partida 37',
      'E. Lasker-W. Steinitz',
      'EEUU-Canadá 1894',
      'Campeonato Mundial, Match, 7ª partida',
      'Apertura Española (C62)',
      '1 e4 e5 2 Cf3 Cc6 3 Ab5 d6 4 d4 Ad7 5 Cc3 Cge7',
    ].join('\n')
    const games = recognizeGames(text, { algorithm: 2 })
    expect(games).toHaveLength(2)
    expect(text.slice(games[0].charStart, games[0].charEnd)).toBe('1 f4 d5 2 e3 Cf6')
  })
})
