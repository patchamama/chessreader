import { describe, it, expect } from 'vitest'
import { recognizeGames } from '../../recognition/recognizeGames.js'
import { spanishToEnglish } from '../../notation/spanishToEnglish.js'

const sans = (g: ReturnType<typeof recognizeGames>[number]) => g.tree.mainline.map((id) => g.tree.nodes.get(id)!.san)

describe('move numbers without a dot and the "…" ellipsis (Kasparov, "Mis geniales predecesores")', () => {
  const text = [
    'Partida 298',
    'T. Petrosian-V. Smyslov',
    '1 d4 d5 2 c4 dxc4 3 Nf3 Nf6 4 Nc3 c6 5 e4!? b5 6 e5',
    'Hablando en general, Petrosian y sacrificio no son palabras que se asocien.',
    '6…Nd5 7 a4 e6',
    'Si 7…Be6?!, probablemente no hubiera seguido con 8 axb5 Nxc3 9 bxc3 cxb5, con ventaja negra.',
    '8 axb5',
  ].join('\n')
  const games = recognizeGames(text, { algorithm: 2 })
  it('reads the main line', () => {
    expect(games).toHaveLength(1)
    expect(sans(games[0])).toEqual(['d4', 'd5', 'c4', 'dxc4', 'Nf3', 'Nf6', 'Nc3', 'c6', 'e4', 'b5', 'e5', 'Nd5', 'a4', 'e6', 'axb5'])
    expect(games[0].tree.errors).toEqual([])
  })
  it('puts the prose alternative 7…Be6 in a variation', () => {
    const be6 = [...games[0].tree.nodes.values()].find((n) => n.san === 'Be6')
    expect(be6).toBeDefined()
    expect(games[0].tree.mainline).not.toContain(be6!.id)
  })
  it('does not read a plain number in prose as a move number', () => {
    const [g] = recognizeGames('1.e4 e5 2.Nf3 Nc6\nEn 2 partidas siguió 3 jugadas más.\n3.Bb5 a6', { algorithm: 2 })
    expect(sans(g)).toEqual(['e4', 'e5', 'Nf3', 'Nc6', 'Bb5', 'a6'])
    expect(g.tree.errors).toEqual([])
  })
})

describe('engine lines inserted in a book ("Stockfish 14 eval: [-0.82] 8 Ae2 Ab7 …")', () => {
  const text = [
    '1 d4 Nf6 2 c4 e6 3 Nc3 Bb4 4 e3 0-0 5 Bd3 d5 6 Nf3 c5 7 0-0 Nc6',
    '￼',
    'Stockfish 14 eval: [+0.48] 8 cxd5 exd5 9 dxc5 Axc5 10 h3 De7 11 b3 Td8',
    '8 a3 Bxc3 9 bxc3 b6?!',
  ].join('\n')
  const [g] = recognizeGames(text, { algorithm: 2 })
  it('reads the engine line, written in Spanish letters, as a variation of the English game', () => {
    expect(sans(g)).toEqual(['d4', 'Nf6', 'c4', 'e6', 'Nc3', 'Bb4', 'e3', 'O-O', 'Bd3', 'd5', 'Nf3', 'c5', 'O-O', 'Nc6', 'a3', 'Bxc3', 'bxc3', 'b6'])
    expect(g.tree.errors).toEqual([])
    const td8 = [...g.tree.nodes.values()].find((n) => n.san === 'Rd8')
    expect(td8).toBeDefined()
    expect(g.tree.mainline).not.toContain(td8!.id)
  })
})

describe('an engine line after a diagram belongs to the main line, not to the prose variation before it', () => {
  const text = [
    '1 d4 d5 2 c4 dxc4 3 Nf3 Nf6 4 Nc3 c6 5 e4 b5 6 e5',
    '6…Nd5 7 a4 e6',
    'Si 7…Be6?!, sino con 8 Ng5! Nxc3 9 bxc3 Bd5 10 e6! fxe6 11 Bf4 (Taimanov), con peligrosa iniciativa.',
    '￼',
    'Stockfish 14 eval: [-0.82] 8 Ae2 Ab7 9 O-O Ae7 10 Ce4 h6 11 axb5 cxb5 12 b3 a5',
    '8 axb5',
  ].join('\n')
  const [g] = recognizeGames(text, { algorithm: 2 })
  it('branches the engine line from 7…e6', () => {
    expect(g.tree.errors).toEqual([])
    const e6 = g.tree.mainline[13]
    const lines = g.tree.variations.get(e6)!.map((l) => l.map((id) => g.tree.nodes.get(id)!.san).join(' '))
    expect(lines).toContain('Be2 Bb7 O-O Be7 Ne4 h6 axb5 cxb5 b3 a5')
  })
})

describe('a prose variation interrupted by a quote goes on after it (same paragraph)', () => {
  const text = [
    '1 d4 d5 2 c4 dxc4 3 Nf3 Nf6 4 Nc3 c6 5 e4 b5 6 e5 Nd5 7 a4 e6 8 axb5 Nxc3 9 bxc3 cxb5 10 Ng5 Bb7 11 Qh5 g6',
    'Después de 11…Qd7, “una jugada más en el espíritu de Steinitz” (Crouch), las blancas probablemente hubieran replicado no 12 Nxh7?! Nc6 13 Nxf8?, sino sencillamente 12 Be2.',
    '12 Qg4',
  ].join('\n')
  const [g] = recognizeGames(text, { algorithm: 2 })
  it('12 Nxh7 continues 11…Qd7 and 12 Be2 branches from it', () => {
    expect(g.tree.errors).toEqual([])
    const qd7 = [...g.tree.nodes.values()].find((n) => n.san === 'Qd7')!
    const children = [...g.tree.nodes.values()].filter((n) => n.parentId === qd7.id).map((n) => n.san).sort()
    expect(children).toEqual(['Be2', 'Nxh7'])
  })
})

describe('a "(" the book never closes does not swallow the game', () => {
  const text = [
    '1 d4 d5 2 c4 dxc4 3 Nf3 Nf6 4 Nc3 c6 5 e4 b5 6 e5 Nd5 7 a4 e6',
    '8 axb5',
    'Un plan más moderno es 8 Ng5 h6 9 Nge4 b4 10 Nb1 Ba6 11 Qg4!? (la partida fuente, o bien 11 Nbd2 Nf4! (también se ha jugado 11…c3) 12 Qg4 Nd3+, las negras tienen un excelente final.',
    '8…Nxc3 9 bxc3 cxb5 10 Ng5 Bb7 11 Qh5 g6',
  ].join('\n')
  const [g] = recognizeGames(text, { algorithm: 2 })
  it('the next paragraph that goes on with the game is the main line again', () => {
    expect(g.tree.mainline.map((id) => g.tree.nodes.get(id)!.san).slice(15)).toEqual(['Nxc3', 'bxc3', 'cxb5', 'Ng5', 'Bb7', 'Qh5', 'g6'])
  })
})

describe('a promotion written without "=" ("32 b8D!", "fxg8D+")', () => {
  it('is read, in Spanish and in English letters', () => {
    expect(spanishToEnglish('32 b8D! Txb8 30 fxg8D+')).toBe('32 b8Q! Rxb8 30 fxg8Q+')
    const [g] = recognizeGames('1. e4 d5 2. exd5 c6 3. dxc6 Nf6 4. cxb7 Nbd7 5. bxa8D', { algorithm: 2 })
    expect(sans(g).at(-1)).toBe('bxa8=Q')
    expect(g.tree.errors).toEqual([])
  })
})
