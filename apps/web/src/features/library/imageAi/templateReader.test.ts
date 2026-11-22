import { describe, it, expect } from 'vitest'
import { boardPatches, cropBoard, learnTemplates, readSquares, readingsToBoard, PATCH } from './templateReader'
import { drawBoard, MARGIN, SQUARE } from './syntheticBoard.testutil'

const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR'
const OTHER = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR'.replace('8/8/8/8', '8/8/4P3/8').replace('PPPPPPPP', 'PPPP1PPP')

describe('templateReader', () => {
  it('crops the board to the bounding box of its non-white pixels', () => {
    const crop = cropBoard(drawBoard(START))
    expect(crop).toEqual({ x: MARGIN, y: MARGIN, side: SQUARE * 8 })
  })

  it('cuts the board into 64 grey patches, rank 8 first, values 0..1', () => {
    const patches = boardPatches(drawBoard('8/8/8/8/8/8/8/8'))
    expect(patches).toHaveLength(64)
    expect(patches[0]).toHaveLength(PATCH * PATCH)
    // a8 is a light square, b8 a dark one.
    const mean = (p: Float32Array) => p.reduce((s, v) => s + v, 0) / p.length
    expect(mean(patches[0])).toBeCloseTo(225 / 255, 1)
    expect(mean(patches[1])).toBeCloseTo(140 / 255, 1)
  })

  it('reads a board through the templates learnt from another board of the same book', () => {
    const templates = learnTemplates([{ patches: boardPatches(drawBoard(START)), fen: `${START} w KQkq - 0 1` }])
    const readings = readSquares(boardPatches(drawBoard(OTHER)), templates)
    expect(readingsToBoard(readings)).toBe(OTHER)
    // Several readings per square, each with a confidence in 0..1, the best first.
    const e4 = readings.filter((r) => r.square === 'e4')
    expect(e4[0]).toMatchObject({ piece: 'P' })
    expect(e4.every((r) => r.confidence >= 0 && r.confidence <= 1)).toBe(true)
    expect(e4[0].confidence).toBeGreaterThan(e4[1]?.confidence ?? 0)
  })

  it('reads nothing without templates', () => {
    expect(readSquares(boardPatches(drawBoard(START)), learnTemplates([]))).toEqual([])
  })
})
