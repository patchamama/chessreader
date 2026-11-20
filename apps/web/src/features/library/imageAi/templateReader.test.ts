import { describe, it, expect } from 'vitest'
import { boardPatches, cropBoard, learnTemplates, readSquares, readingsToBoard, PATCH, type ImageLike } from './templateReader'

/**
 * A synthetic diagram: a white margin, an 8x8 board of light/dark squares and
 * every piece drawn as its own small mark (a filled block whose size and
 * position depend on the letter). Never a book image.
 */
const SQUARE = 24
const MARGIN = 10
const SHAPES: Record<string, [number, number, number, number, number]> = {
  // x0, y0, x1, y1 (fractions of the square), grey
  P: [0.35, 0.55, 0.65, 0.85, 250], p: [0.35, 0.55, 0.65, 0.85, 20],
  N: [0.2, 0.2, 0.5, 0.8, 250], n: [0.2, 0.2, 0.5, 0.8, 20],
  B: [0.4, 0.1, 0.6, 0.9, 250], b: [0.4, 0.1, 0.6, 0.9, 20],
  R: [0.15, 0.4, 0.85, 0.85, 250], r: [0.15, 0.4, 0.85, 0.85, 20],
  Q: [0.1, 0.1, 0.9, 0.5, 250], q: [0.1, 0.1, 0.9, 0.5, 20],
  K: [0.25, 0.25, 0.75, 0.75, 250], k: [0.25, 0.25, 0.75, 0.75, 20],
}

function rowsOf(board: string): string[][] {
  return board.split('/').map((r) => r.split('').flatMap((c) => (/\d/.test(c) ? Array(Number(c)).fill('.') : [c])))
}

function drawBoard(board: string): ImageLike {
  const size = (SQUARE * 8) + (2 * MARGIN)
  const data = new Uint8ClampedArray(size * size * 4).fill(255)
  const put = (x: number, y: number, g: number) => {
    const i = ((y * size) + x) * 4
    data[i] = g; data[i + 1] = g; data[i + 2] = g; data[i + 3] = 255
  }
  const rows = rowsOf(board)
  for (let r = 0; r < 8; r++) {
    for (let f = 0; f < 8; f++) {
      const grey = (r + f) % 2 === 0 ? 225 : 140
      const ox = MARGIN + (f * SQUARE), oy = MARGIN + (r * SQUARE)
      for (let y = 0; y < SQUARE; y++) for (let x = 0; x < SQUARE; x++) put(ox + x, oy + y, grey)
      const shape = SHAPES[rows[r][f]]
      if (!shape) continue
      const [x0, y0, x1, y1, g] = shape
      for (let y = Math.round(y0 * SQUARE); y < Math.round(y1 * SQUARE); y++) {
        for (let x = Math.round(x0 * SQUARE); x < Math.round(x1 * SQUARE); x++) put(ox + x, oy + y, g)
      }
    }
  }
  return { width: size, height: size, data }
}

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
