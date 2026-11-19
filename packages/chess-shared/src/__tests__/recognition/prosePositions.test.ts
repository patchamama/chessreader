import { describe, it, expect } from 'vitest'
import { Chess } from 'chess.js'
import { recognizeGames, unanchoredMoves, DIAGRAM_MARK } from '../../recognition/recognizeGames.js'
import type { GameTree } from '../../model/gameTree.js'

type Game = ReturnType<typeof recognizeGames>[number]
const mainSans = (g: Game) => g.tree.mainline.map((id) => g.tree.nodes.get(id)!.san)
const validNodes = (tree: GameTree) => [...tree.nodes.values()].filter((n) => n.fen && !n.invalid)
const board = (fen: string) => fen.split(' ')[0]

// Nimzowitsch, "Mi sistema", diagram 200: the position is only described in prose.
const DIAGRAM_200 = [
  'El ejemplo más simple puede verse en la posición ♔b1, ♖b3, ♘d2, peón f3 (blancas) - ♔h8, ♗f6, ♘b6, peón a7, a5 (negras). Diagrama 200.',
  DIAGRAM_MARK,
  '1.♘e4 a4 2.♖xb6',
  'Para ganar el tiempo.',
  '2...axb6 3.♘xf6',
  'Las blancas ganan.',
].join('\n')
const FEN_200 = '7k/p7/1n3b2/p7/8/1R3P2/3N4/1K6'

describe('a position described in prose starts the fragment that follows it (S3)', () => {
  it('reads figurines and pawn lists, white to move after "1."', () => {
    const games = recognizeGames(DIAGRAM_200, { algorithm: 2 })
    expect(games).toHaveLength(1)
    expect(board(games[0].tree.startFen)).toBe(FEN_200)
    expect(games[0].tree.startFen.split(' ')[1]).toBe('w')
    expect(mainSans(games[0])).toEqual(['Ne4', 'a4', 'Rxb6', 'axb6', 'Nxf6'])
    expect(games[0].tree.errors).toEqual([])
  })

  it('the game span starts at the description, whose squares are not moves', () => {
    const games = recognizeGames(DIAGRAM_200, { algorithm: 2 })
    const descEnd = DIAGRAM_200.indexOf('(negras)')
    expect(games[0].charStart).toBe(DIAGRAM_200.indexOf('♔b1'))
    const inside = (at?: number) => at !== undefined && at < descEnd
    expect(validNodes(games[0].tree).some((n) => inside(n.charStart))).toBe(false)
    expect(games[0].tree.isolatedMoves.some((m) => inside(m.charStart))).toBe(false)
  })

  it('black to move after "1...", numbered as the book', () => {
    const text = [
      'En la posición ♔h2, ♕b2, peón a2, e5, h3 (blancas) - ♔b8, ♕d6, ♘b7, peón a4 (negras), Diagrama 201.',
      DIAGRAM_MARK,
      'El segundo jugador realiza el siguiente avance:',
      '1...a3',
      'Las blancas están preparadas para cambiar damas.',
      '2.♕xb7+!',
    ].join('\n')
    const games = recognizeGames(text, { algorithm: 2 })
    expect(games).toHaveLength(1)
    expect(games[0].tree.startFen).toBe('1k6/1n6/3q4/4P3/p7/7P/PQ5K/8 b - - 0 1')
    expect(mainSans(games[0])).toEqual(['a3', 'Qxb7+'])
  })

  it('reads Spanish piece letters (R = king) and "peones"', () => {
    const text = 'En la posición Rb1, Tb3, Cd2, peones f3 (blancas) - Rh8, Af6, Cb6, peones a7, a5 (negras).\n1.Ce4 a4 2.Txb6 axb6 3.Cxf6'
    const games = recognizeGames(text, { algorithm: 2 })
    expect(games).toHaveLength(1)
    expect(board(games[0].tree.startFen)).toBe(FEN_200)
    expect(mainSans(games[0])).toEqual(['Ne4', 'a4', 'Rxb6', 'axb6', 'Nxf6'])
  })

  it('reads English letters, "(White) … (Black)" and "etc."', () => {
    const text = 'Consider the position Kb1, Rb3, Nd2, pawn f3 (White) - Kh8, Bf6, Nb6, pawns a7, a5, etc. (Black).\n1.Ne4 a4 2.Rxb6 axb6 3.Nxf6'
    const games = recognizeGames(text, { algorithm: 2 })
    expect(games).toHaveLength(1)
    expect(board(games[0].tree.startFen)).toBe(FEN_200)
    expect(mainSans(games[0])).toEqual(['Ne4', 'a4', 'Rxb6', 'axb6', 'Nxf6'])
  })

  it('places a king the description leaves out, so the moves can be played (diagram 197)', () => {
    const text = [
      'Un ejemplo muy simple. En la posición ♖e1, ♗e4 (blancas) - ♔g8, ♘c6, ♗b3, peón f7, g7, h7 (negras), Diagrama 197.',
      DIAGRAM_MARK,
      'Las blancas quieren llegar a la octava fila. El procedimiento correcto es hacer 1.♗xc6, con cuyo cambio las negras no tienen tiempo.',
    ].join('\n')
    const games = recognizeGames(text, { algorithm: 2 })
    expect(games).toHaveLength(1)
    const start = new Chess(games[0].tree.startFen)
    expect(start.get('e1')).toEqual({ type: 'r', color: 'w' })
    expect(start.get('e4')).toEqual({ type: 'b', color: 'w' })
    expect(start.get('g8')).toEqual({ type: 'k', color: 'b' })
    expect(start.findPiece({ type: 'k', color: 'w' })).toHaveLength(1)
    expect(mainSans(games[0])).toEqual(['Bxc6'])
  })

  it('alternatives written as new "1." moves start again from the same position', () => {
    const text = [
      'En la posición ♔b1, ♖b3, ♘d2, peón f3 (blancas) - ♔h8, ♗f6, ♘b6, peón a7, a5 (negras). Diagrama 200.',
      DIAGRAM_MARK,
      'Si juegan 1.♖a3, las negras tienen tiempo. Lo correcto es 1.♘e4 a4 2.♖xb6',
    ].join('\n')
    const games = recognizeGames(text, { algorithm: 2 })
    const played = games.flatMap((g) => validNodes(g.tree).map((n) => n.san))
    expect(played).toEqual(expect.arrayContaining(['Ra3', 'Ne4', 'a4', 'Rxb6']))
    for (const g of games) expect(board(g.tree.startFen)).toBe(FEN_200)
  })

  it('is not used when the moves that follow cannot be played from it', () => {
    const text = [
      'En la posición ♘d4, peón e3, f3, g3, h3 (blancas) - ♗e7, peón d5, f7, g7, h7 (negras), Diagrama 198.',
      DIAGRAM_MARK,
      '1.exd5',
      '1...cxd5 2.♖e8+',
    ].join('\n')
    const games = recognizeGames(text, { algorithm: 2 })
    for (const g of games) expect(board(g.tree.startFen)).not.toContain('3N4')
  })

  it('leaves a book game with no description untouched', () => {
    const games = recognizeGames('1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 (blancas)', { algorithm: 2 })
    expect(games[0].tree.startFen.startsWith('rnbqkbnr/pppppppp')).toBe(true)
    expect(mainSans(games[0])).toEqual(['e4', 'e5', 'Nf3', 'Nc6', 'Bb5', 'a6'])
  })
})

describe('unanchoredMoves: notation no game could place (S3)', () => {
  it('marks the moves of a fragment after a diagram with no known position', () => {
    const text = [
      'Un vistazo a la posición revela que el caballo negro de “h2” ha quedado extraviado.',
      DIAGRAM_MARK,
      '1...cxd5 2.♖e8+',
      'La torre negra que está en “c8” debe morir.',
      '2...♖xe8 3.♖xe8+ ♔h7',
    ].join('\n')
    const games = recognizeGames(text, { algorithm: 2 })
    const marks = unanchoredMoves(text, games)
    expect(marks.map((m) => m.rawSan)).toEqual(['cxd5', '♖e8+', '♖xe8', '♖xe8+', '♔h7'])
    expect(marks.map((m) => m.square)).toEqual(['d5', 'e8', 'e8', 'e8', 'h7'])
    expect(marks[1].piece).toBe('r')
    for (const m of marks) expect(text.slice(m.charStart, m.charEnd)).toBe(m.rawSan)
  })

  it('leaves out moves a game already shows and bare squares of the prose', () => {
    const text = [
      '1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 4. Ba4 Nf6',
      'A similar idea, with the knight on “g4”, was seen in a famous game.',
      DIAGRAM_MARK,
      '23. Rxe5 Qxe5 24. Bb2',
    ].join('\n')
    const games = recognizeGames(text, { algorithm: 2 })
    expect(unanchoredMoves(text, games).map((m) => m.san)).toEqual(['Rxe5', 'Qxe5', 'Bb2'])
  })

  it('finds nothing when every move is part of a game', () => {
    const games = recognizeGames(DIAGRAM_200, { algorithm: 2 })
    expect(unanchoredMoves(DIAGRAM_200, games)).toEqual([])
  })
})
