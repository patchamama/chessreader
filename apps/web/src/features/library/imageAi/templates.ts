import type { SquareReading } from '@chess-ebook/chess-shared'
import { imageDataOf } from './imageData'
import { registeredDiagrams, bookKeyOf } from './diagramRegistry'
import { useSessionFenStore } from './sessionFens'
import { boardPatches, cropBoard, learnTemplates, readSquares } from './templateReader'
import { entriesFromDiagram, useSquareBank } from './squareBank'

/** Where the board sits in an image, as fractions of its width and height. */
export interface BoardBox { x: number; y: number; w: number; h: number }

interface LoadedBoard { patches: Float32Array[]; box: BoardBox }

/** Patches (and the board's box) per image src (an image is cut once per session). */
const boardCache = new Map<string, Promise<LoadedBoard>>()

export function loadBoard(src: string): Promise<LoadedBoard> {
  let p = boardCache.get(src)
  if (!p) {
    p = imageDataOf(src).then((img) => {
      const c = cropBoard(img)
      return { patches: boardPatches(img), box: { x: c.x / img.width, y: c.y / img.height, w: c.side / img.width, h: c.side / img.height } }
    })
    p.catch(() => boardCache.delete(src))
    boardCache.set(src, p)
  }
  return p
}

export function patchesOf(src: string): Promise<Float32Array[]> {
  return loadBoard(src).then((b) => b.patches)
}

/** Diagrams of the book on screen whose FEN is known: printed next to them, or accepted this session. */
function knownDiagrams(src: string, includeSelf: boolean): Map<string, string> {
  const book = bookKeyOf(src)
  const session = useSessionFenStore.getState().fens
  const known = new Map<string, string>()
  for (const d of registeredDiagrams()) {
    if ((!includeSelf && d.src === src) || bookKeyOf(d.src) !== book) continue
    const fen = d.printedFen ?? session[d.src]
    if (fen) known.set(d.src, fen)
  }
  return known
}

/** Grows the bank of the diagram's book with the squares of every known diagram of the book on screen. */
export async function learnFromKnownDiagrams(src: string): Promise<void> {
  const book = bookKeyOf(src)
  for (const [s, fen] of knownDiagrams(src, true)) {
    try {
      useSquareBank.getState().add(book, entriesFromDiagram(await patchesOf(s), fen))
    } catch { /* an image that cannot be read teaches nothing */ }
  }
}

/**
 * The template reading of a diagram: templates learnt from the other diagrams
 * of the same book on screen whose FEN is known (printed next to them, or
 * accepted this session). [] when the book has none or the images cannot be read.
 */
export async function templateReadings(src: string): Promise<{ readings: SquareReading[]; samples: number }> {
  const known = knownDiagrams(src, false)
  if (!known.size) return { readings: [], samples: 0 }
  const samples = (await Promise.all([...known].map(async ([s, fen]) => {
    try { return { patches: await patchesOf(s), fen } } catch { return null }
  }))).filter((x): x is { patches: Float32Array[]; fen: string } => !!x)
  if (!samples.length) return { readings: [], samples: 0 }
  try {
    return { readings: readSquares(await patchesOf(src), learnTemplates(samples)), samples: samples.length }
  } catch {
    return { readings: [], samples: 0 }
  }
}
