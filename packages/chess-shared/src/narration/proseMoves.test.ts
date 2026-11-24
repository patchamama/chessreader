import { describe, expect, it } from 'vitest'
import { wordIndexAt } from './actions.js'
import { findProseMoves, isolatedMoveOrigins, proseMoveCues, proseMoveSchedule, resolveProseMoves } from './proseMoves.js'

// 1.e4 e5 2.Nf3 Nc6 3.Bb5 a6 — White to move.
const SPANISH_W = 'r1bqkbnr/1ppp1ppp/p1n5/1B2p3/4P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 0 4'
// 1.e4 e5 2.Nf3 Nc6 3.Bb5 — Black to move.
const SPANISH_B = 'r1bqkbnr/pppp1ppp/2n5/1B2p3/4P3/5N2/PPPP1PPP/RNBQK2R b KQkq - 3 3'
// 1.e4 — Black to move.
const AFTER_E4 = 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1'

const moves = (text: string, fen: string) => resolveProseMoves(text, fen).filter((r) => r.moves.length).map((r) => ({ text: r.mention.text, moves: r.moves.map((m) => `${m.piece}${m.from}-${m.to}`), secondary: r.secondary }))

describe('findProseMoves: Spanish piece letters in prose (S5)', () => {
  it('finds Aa4, Ac5!, Cge7, Cg6 and Rh8 with their piece, origin hint and target', () => {
    const found = (t: string) => findProseMoves(t).map((m) => [m.text, m.piece, m.hint, m.to])
    expect(found('Vamos a ver cómo jugar contra Aa4, recordad que en el curso podréis ver analizadas en profundidad todas las opciones.')).toEqual([['Aa4', 'b', '', 'a4']])
    expect(found('Aquí ya vamos a empezar a sorprender al rival, nos alejamos de las respuestas más convencionales y jugamos activamente con Ac5!')).toEqual([['Ac5!', 'b', '', 'c5']])
    expect(found('Ahora continuamos con Cge7, buscando un posible Cg6 controlando la casilla f4.')).toEqual([['Cge7', 'n', 'g', 'e7'], ['Cg6', 'n', '', 'g6'], ['f4', null, '', 'f4']])
    expect(found('El rey se retira con Rh8 y la torre con Tb1')).toEqual([['Rh8', 'k', '', 'h8'], ['Tb1', 'r', '', 'b1']])
  })

  it('reads a bare square as a pawn move and a named square ("la casilla f4") as no move', () => {
    const found = findProseMoves('Nuestra jugada ahora es a6 y controlamos la casilla f4.')
    expect(found.map((m) => [m.text, m.piece, m.to, m.named])).toEqual([['a6', null, 'a6', false], ['f4', null, 'f4', true]])
  })

  it('does not read ordinary words, move numbers or squares of a pair as moves', () => {
    expect(findProseMoves('Después de la jugada Cada uno decide. 12. Tras e2-e4 sigue.')).toEqual([])
  })
})

describe('resolveProseMoves: the piece that really makes the move, from the current position (S5)', () => {
  it('"Nuestra jugada ahora es a6" with Black to move is the pawn a7-a6, seen from the side to move', () => {
    expect(moves('Nuestra jugada ahora es a6', AFTER_E4)).toEqual([{ text: 'a6', moves: ['pa7-a6'], secondary: false }])
    const cue = proseMoveCues(resolveProseMoves('Nuestra jugada ahora es a6', AFTER_E4)[0])
    expect(cue.squares.map((s) => s.square).sort()).toEqual(['a6', 'a7'])
    expect(cue.arrows).toEqual([{ from: 'a7', to: 'a6', role: 'to' }])
  })

  it('"contra Aa4": the bishop on b5 is shown on its square with the move to a4', () => {
    const [r] = resolveProseMoves('Vamos a ver cómo jugar contra Aa4, recordad que en el curso', SPANISH_W)
    expect(r.moves).toEqual([{ piece: 'b', color: 'w', from: 'b5', to: 'a4' }])
    expect(proseMoveCues(r).arrows).toEqual([{ from: 'b5', to: 'a4', role: 'to' }])
  })

  it('"con Ac5!": Black\'s bishop f8 to c5', () => {
    expect(moves('jugamos activamente con Ac5!', SPANISH_B)).toEqual([{ text: 'Ac5!', moves: ['bf8-c5'], secondary: false }])
  })

  it('"Cge7" uses the origin hint: the knight of g8, not the one of c6', () => {
    expect(moves('Ahora continuamos con Cge7', SPANISH_B)[0].moves).toEqual(['ng8-e7'])
  })

  it('a king move written Rh8 reads R as the king in Spanish', () => {
    expect(moves('jugamos Rh8 enseguida', '6k1/8/8/8/8/8/8/4K3 b - - 0 1')[0].moves).toEqual(['kg8-h8'])
  })

  it('a piece of the other side is used when the side to move cannot make the move', () => {
    // White to move, but the text talks about Black\'s bishop going to c5.
    expect(moves('el alfil negro puede ir a Ac5', SPANISH_W)[0].moves).toEqual(['bf8-c5'])
  })

  it('"Las blancas pueden jugar con c3, con idea de d4, o con d3": every white pawn that reaches c3, d4 and d3, with Black to move', () => {
    const text = 'Las blancas pueden jugar con c3, con idea de d4, o con d3, más pasiva.'
    expect(moves(text, SPANISH_B)).toEqual([
      { text: 'c3', moves: ['pc2-c3'], secondary: false },
      { text: 'd4', moves: ['pd2-d4'], secondary: false },
      { text: 'd3', moves: ['pd2-d3'], secondary: false },
    ])
    const cues = resolveProseMoves(text, SPANISH_B).map(proseMoveCues)
    expect(cues.flatMap((c) => c.arrows.map((a) => `${a.from}${a.to}`))).toEqual(['c2c3', 'd2d4', 'd2d3'])
  })

  it('a bare square is a move of the side to move unless the sentence names the other side', () => {
    expect(moves('Podemos jugar a3', AFTER_E4)).toEqual([])
    expect(moves('Las blancas juegan a3', AFTER_E4)).toEqual([{ text: 'a3', moves: ['pa2-a3'], secondary: false }])
    expect(moves('Podemos jugar e4', 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1')[0].moves).toEqual(['pe2-e4'])
  })
})

describe('look-ahead: a follow-up named in the same comment (S5)', () => {
  const text = 'Ahora continuamos con Cge7, buscando un posible Cg6 controlando la casilla f4.'
  it('Cg6 is resolved on the position after Cge7, as a secondary suggestion', () => {
    expect(moves(text, SPANISH_B)).toEqual([
      { text: 'Cge7', moves: ['ng8-e7'], secondary: false },
      { text: 'Cg6', moves: ['ne7-g6'], secondary: true },
    ])
  })

  it('its cues are told apart: primary from/to, secondary as a mention', () => {
    const [a, b] = resolveProseMoves(text, SPANISH_B).map(proseMoveCues)
    expect(a.squares.map((s) => s.role)).toEqual(['from', 'to'])
    expect(b.squares.map((s) => s.role)).toEqual(['mention', 'mention'])
    expect(b.arrows[0]).toMatchObject({ from: 'e7', to: 'g6', role: 'mention' })
  })

  it('without a follow-up cue a move legal now is read now', () => {
    expect(moves('Cge7 o Cf6', SPANISH_B).map((m) => m.secondary)).toEqual([false, false])
  })
})

describe('proseMoveSchedule: each move appears as the narration reaches its word', () => {
  it('gives the word index of every mention, in order', () => {
    const text = 'Ahora continuamos con Cge7, buscando un posible Cg6 controlando la casilla f4.'
    expect(proseMoveSchedule(text, SPANISH_B).map((s) => s.at)).toEqual([3, 7])
    expect(wordIndexAt(text, text.indexOf('Cg6'))).toBe(7)
  })
})

describe('isolatedMoveOrigins: the piece of an isolated move on the position', () => {
  it('finds the legal origin for the side to move first, pawns included', () => {
    expect(isolatedMoveOrigins(SPANISH_W, 'b', 'a4')).toEqual({ from: ['b5'], color: 'w' })
    expect(isolatedMoveOrigins(AFTER_E4, 'p', 'a6')).toEqual({ from: ['a7'], color: 'b' })
    expect(isolatedMoveOrigins(SPANISH_B, 'n', 'e7', 'g')).toEqual({ from: ['g8'], color: 'b' })
    // a pawn capture names its file: exd4 with a pawn on e5 and a white pawn on d4
    expect(isolatedMoveOrigins('4k3/8/8/4p3/3P4/8/8/4K3 b - - 0 1', 'p', 'd4', 'e', true)).toEqual({ from: ['e5'], color: 'b' })
  })
  it('falls back to the other side, then to nothing', () => {
    expect(isolatedMoveOrigins(SPANISH_W, 'b', 'c5')).toEqual({ from: ['f8'], color: 'b' })
    expect(isolatedMoveOrigins('4k3/8/8/8/2B5/8/8/4K3 w - - 0 1', 'b', 'b6')).toEqual({ from: [], color: null })
    expect(isolatedMoveOrigins('not a fen', 'b', 'a4')).toEqual({ from: [], color: null })
  })
})
