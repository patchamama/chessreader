import type { SquareReading } from '@chess-ebook/chess-shared'

/**
 * Board diagrams read with templates learnt from the book itself (a port of
 * packages/chess-shared/scripts/diagram_fen.py). Diagrams with a known FEN are
 * the training data: each is cut into 64 squares, every square is reduced to a
 * small grey patch, and a template per (piece, square colour) is the average
 * patch. Another diagram is then read square by square (nearest templates).
 *
 * The functions are pure over ImageData-like pixels; `imageDataOf` (imageData.ts)
 * draws an image on a canvas to get them.
 */

export const PATCH = 20
const WHITE = 235
const FILES = 'abcdefgh'
const ALTERNATIVES = 3

/** RGBA pixels, as ImageData. */
export interface ImageLike {
  width: number
  height: number
  data: Uint8ClampedArray
}

export interface Crop {
  x: number
  y: number
  side: number
}

/** Per (piece or "." for empty, square colour 0 light / 1 dark) the average patch. */
export type Templates = Map<string, Float32Array>

export interface TemplateSample {
  patches: Float32Array[]
  /** The diagram's FEN (only the board field is used). */
  fen: string
}

function grey(img: ImageLike): Float32Array {
  const out = new Float32Array(img.width * img.height)
  for (let i = 0; i < out.length; i++) {
    const k = i * 4
    const alpha = img.data[k + 3] / 255
    // A transparent pixel is white paper.
    const g = (0.299 * img.data[k]) + (0.587 * img.data[k + 1]) + (0.114 * img.data[k + 2])
    out[i] = (g * alpha) + (255 * (1 - alpha))
  }
  return out
}

/** The board area: the bounding box of the non-white pixels (diagrams sit on white), made square. */
export function cropBoard(img: ImageLike): Crop {
  const g = grey(img)
  let x0 = img.width, y0 = img.height, x1 = -1, y1 = -1
  for (let y = 0; y < img.height; y++) {
    for (let x = 0; x < img.width; x++) {
      if (g[(y * img.width) + x] >= WHITE) continue
      if (x < x0) x0 = x
      if (x > x1) x1 = x
      if (y < y0) y0 = y
      if (y > y1) y1 = y
    }
  }
  if (x1 < 0) return { x: 0, y: 0, side: Math.min(img.width, img.height) }
  // Inclusive: the last non-white pixel belongs to the board.
  return { x: x0, y: y0, side: Math.max(x1 - x0, y1 - y0) + 1 }
}

/** 64 grey patches (PATCH x PATCH values 0..1), rank 8 first, file a first. */
export function boardPatches(img: ImageLike): Float32Array[] {
  const g = grey(img)
  const { x, y, side } = cropBoard(img)
  const size = PATCH * 8
  const scale = Math.max(side, 1) / size
  // Area average of the source pixels under each target pixel (outside the image: white).
  const at = (sx: number, sy: number) =>
    (sx < 0 || sy < 0 || sx >= img.width || sy >= img.height ? 255 : g[(sy * img.width) + sx])
  const resized = new Float32Array(size * size)
  for (let ty = 0; ty < size; ty++) {
    const ya = y + Math.floor(ty * scale), yb = Math.max(ya + 1, y + Math.floor((ty + 1) * scale))
    for (let tx = 0; tx < size; tx++) {
      const xa = x + Math.floor(tx * scale), xb = Math.max(xa + 1, x + Math.floor((tx + 1) * scale))
      let sum = 0, n = 0
      for (let sy = ya; sy < yb; sy++) for (let sx = xa; sx < xb; sx++) { sum += at(sx, sy); n++ }
      resized[(ty * size) + tx] = sum / n / 255
    }
  }
  const patches: Float32Array[] = []
  for (let r = 0; r < 8; r++) {
    for (let f = 0; f < 8; f++) {
      const p = new Float32Array(PATCH * PATCH)
      for (let py = 0; py < PATCH; py++) {
        for (let px = 0; px < PATCH; px++) p[(py * PATCH) + px] = resized[(((r * PATCH) + py) * size) + (f * PATCH) + px]
      }
      patches.push(p)
    }
  }
  return patches
}

function boardRows(fen: string): string[][] | null {
  const ranks = fen.trim().split(/\s+/)[0]?.split('/') ?? []
  if (ranks.length !== 8) return null
  const rows = ranks.map((r) => r.split('').flatMap((c) => (/\d/.test(c) ? Array<string>(Number(c)).fill('.') : [c])))
  return rows.every((r) => r.length === 8) ? rows : null
}

const key = (piece: string, colour: number) => `${piece}${colour}`

/** The average patch per (piece, square colour) over diagrams whose FEN is known. */
export function learnTemplates(samples: TemplateSample[]): Templates {
  const sums = new Map<string, { sum: Float32Array; n: number }>()
  for (const s of samples) {
    const rows = boardRows(s.fen)
    if (!rows || s.patches.length !== 64) continue
    for (let r = 0; r < 8; r++) {
      for (let f = 0; f < 8; f++) {
        const k = key(rows[r][f], (r + f) % 2)
        const acc = sums.get(k) ?? { sum: new Float32Array(PATCH * PATCH), n: 0 }
        const p = s.patches[(r * 8) + f]
        for (let i = 0; i < p.length; i++) acc.sum[i] += p[i]
        acc.n++
        sums.set(k, acc)
      }
    }
  }
  const out: Templates = new Map()
  for (const [k, { sum, n }] of sums) out.set(k, sum.map((v) => v / n))
  return out
}

function distance(a: Float32Array, b: Float32Array): number {
  let d = 0
  for (let i = 0; i < a.length; i++) { const x = a[i] - b[i]; d += x * x }
  return d
}

/**
 * Each square read as its nearest templates of the same square colour: up to
 * three readings per square, the confidences (0..1, inverse distance, summing
 * to 1) best first. Without templates: no readings.
 */
export function readSquares(patches: Float32Array[], templates: Templates): SquareReading[] {
  if (!templates.size || patches.length !== 64) return []
  const out: SquareReading[] = []
  for (let r = 0; r < 8; r++) {
    for (let f = 0; f < 8; f++) {
      const colour = (r + f) % 2
      const p = patches[(r * 8) + f]
      const near = [...templates]
        .filter(([k]) => Number(k.slice(1)) === colour)
        .map(([k, t]) => ({ piece: k[0], d: distance(p, t) }))
        .sort((a, b) => a.d - b.d)
        .slice(0, ALTERNATIVES)
      if (!near.length) continue
      const weights = near.map((n) => 1 / (n.d + 1e-6))
      const total = weights.reduce((s, w) => s + w, 0)
      const square = `${FILES[f]}${8 - r}`
      near.forEach((n, i) => out.push({ square, piece: n.piece === '.' ? null : n.piece, confidence: weights[i] / total }))
    }
  }
  return out
}

/** The FEN board of the most confident reading per square (no reading: empty). */
export function readingsToBoard(readings: SquareReading[]): string {
  const best = new Map<string, SquareReading>()
  for (const r of readings) if (!best.has(r.square) || best.get(r.square)!.confidence < r.confidence) best.set(r.square, r)
  const ranks: string[] = []
  for (let rank = 8; rank >= 1; rank--) {
    let row = '', empty = 0
    for (const f of FILES) {
      const piece = best.get(`${f}${rank}`)?.piece
      if (!piece) { empty++; continue }
      if (empty) row += empty
      empty = 0
      row += piece
    }
    ranks.push(row + (empty ? String(empty) : ''))
  }
  return ranks.join('/')
}
