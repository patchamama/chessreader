import type { ImageLike } from './templateReader'

/**
 * A synthetic diagram: a white margin, an 8x8 board of light/dark squares and
 * every piece drawn as its own small mark (a filled block whose size and
 * position depend on the letter). Never a book image.
 */
export const SQUARE = 24
export const MARGIN = 10
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

export function drawBoard(board: string): ImageLike {
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

