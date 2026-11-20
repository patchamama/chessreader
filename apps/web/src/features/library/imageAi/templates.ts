import type { SquareReading } from '@chess-ebook/chess-shared'
import { imageDataOf } from './imageData'
import { registeredDiagrams, bookKeyOf } from './diagramRegistry'
import { useSessionFenStore } from './sessionFens'
import { boardPatches, learnTemplates, readSquares } from './templateReader'

/** Patches per image src (an image is cut once per session). */
const patchCache = new Map<string, Promise<Float32Array[]>>()

function patchesOf(src: string): Promise<Float32Array[]> {
  let p = patchCache.get(src)
  if (!p) {
    p = imageDataOf(src).then(boardPatches)
    p.catch(() => patchCache.delete(src))
    patchCache.set(src, p)
  }
  return p
}

/**
 * The template reading of a diagram: templates learnt from the other diagrams
 * of the same book on screen whose FEN is known (printed next to them, or
 * accepted this session). [] when the book has none or the images cannot be read.
 */
export async function templateReadings(src: string): Promise<{ readings: SquareReading[]; samples: number }> {
  const book = bookKeyOf(src)
  const session = useSessionFenStore.getState().fens
  const known = new Map<string, string>()
  for (const d of registeredDiagrams()) {
    if (d.src === src || bookKeyOf(d.src) !== book) continue
    const fen = d.printedFen ?? session[d.src]
    if (fen) known.set(d.src, fen)
  }
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
