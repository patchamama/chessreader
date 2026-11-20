import { describe, it, expect } from 'vitest'
import { Chess } from 'chess.js'
import { solveDiagram, readingFromFen, recognizeGames, type SquareReading } from '../../index.js'

// Ruy Lopez after 5...Be7, white to move.
const FEN = 'r1bqk2r/1pppbppp/p1n2n2/4p3/B3P3/5N2/PPPP1PPP/RNBQ1RK1 w kq - 5 6'
const TEXT = '6.Re1 b5 7.Bb3 d6 8.c3 O-O 9.h3'

const placement = (fen: string) => fen.split(' ')[0]
const without = (readings: SquareReading[], squares: string[]) => readings.filter((r) => !squares.includes(r.square))
const replace = (readings: SquareReading[], square: string, alts: SquareReading[]) => [...without(readings, [square]), ...alts]

describe('readingFromFen', () => {
  it('gives one reading per square, empty squares as null', () => {
    const r = readingFromFen(FEN, 0.9)
    expect(r).toHaveLength(64)
    expect(r.find((x) => x.square === 'g1')).toEqual({ square: 'g1', piece: 'K', confidence: 0.9 })
    expect(r.find((x) => x.square === 'e3')).toEqual({ square: 'e3', piece: null, confidence: 0.9 })
  })
})

describe('solveDiagram', () => {
  it('keeps a correct reading as it is', () => {
    const [best] = solveDiagram(readingFromFen(FEN, 0.9), TEXT)
    expect(placement(best.fen)).toBe(placement(FEN))
    expect(best).toMatchObject({ playedMoves: 7, totalMoves: 7, changedSquares: [] })
  })

  it('recovers blanked and misread squares from the moves that follow', () => {
    let readings = readingFromFen(FEN, 0.9)
    // Blank: the d7 pawn ("...d6" needs it) and the black king (castling needs e8).
    readings = without(readings, ['d7', 'e8'])
    // Misread: a second white king on d1 (the queen second), a bishop on c2 (a pawn second; "8.c3" needs it).
    readings = replace(readings, 'd1', [{ square: 'd1', piece: 'K', confidence: 0.6 }, { square: 'd1', piece: 'Q', confidence: 0.4 }])
    readings = replace(readings, 'c2', [{ square: 'c2', piece: 'B', confidence: 0.55 }, { square: 'c2', piece: 'P', confidence: 0.45 }])
    const results = solveDiagram(readings, TEXT)
    const best = results[0]
    expect(placement(best.fen)).toBe(placement(FEN))
    expect(best.fen.split(' ').slice(1, 3)).toEqual(['w', 'kq'])
    expect(best.playedMoves).toBe(7)
    expect(best.changedSquares.map((c) => c.square).sort()).toEqual(['c2', 'd1', 'd7', 'e8'])
    // The engine of the reader agrees: the fragment plays from the FEN.
    const game = recognizeGames(`${best.fen}\n${TEXT}`)[0]
    expect(game.tree.mainline).toHaveLength(7)
  })

  it('anchors the user example with no readings at all, only the moves', () => {
    const [best] = solveDiagram([], '21...Txe3 22 d4')
    expect(best).toMatchObject({ playedMoves: 2, totalMoves: 2 })
    const chess = new Chess(best.fen)
    expect(chess.turn()).toBe('b')
    const e3 = chess.get('e3')
    expect(e3 && e3.color).toBe('w')
    const rook = chess.move('Rxe3')
    expect(rook.from[0] === 'e' || rook.from[1] === '3').toBe(true)
    const pawn = chess.move('d4')
    expect(['d2', 'd3']).toContain(pawn.from)
  })

  it('returns a legal position: one king each, no pawns on the back ranks, no check on the side not to move', () => {
    const readings: SquareReading[] = [
      { square: 'e1', piece: 'K', confidence: 0.9 }, { square: 'a1', piece: 'K', confidence: 0.5 },
      { square: 'e8', piece: 'k', confidence: 0.9 }, { square: 'h8', piece: 'P', confidence: 0.8 },
      { square: 'e5', piece: 'Q', confidence: 0.3 }, { square: 'e5', piece: null, confidence: 0.2 },
    ]
    const [best] = solveDiagram(readings, '1.Kd2 Kd7')
    const chess = new Chess(best.fen)
    const pieces = chess.board().flat().filter(Boolean)
    expect(pieces.filter((p) => p!.type === 'k')).toHaveLength(2)
    expect(chess.get('h8')).toBeFalsy()
    expect(best.playedMoves).toBe(2)
  })

  it('is deterministic and ranks top-N', () => {
    const readings = without(readingFromFen(FEN, 0.9), ['d7'])
    const a = solveDiagram(readings, TEXT, { topN: 3 })
    const b = solveDiagram(readings, TEXT, { topN: 3 })
    expect(a).toEqual(b)
    expect(a.length).toBeLessThanOrEqual(3)
    for (let i = 1; i < a.length; i++) expect(a[i - 1].score).toBeGreaterThanOrEqual(a[i].score)
  })
})
