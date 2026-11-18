import { INITIAL_FEN } from './inferDiagramFen'
import { generatedDiagramSvg } from './boardSvg'

/** A diagram of the text: its image, the position it shows and the image file name. */
export interface DiagramRef { src: string; fen: string; fileName: string }

/** A file to hand to the browser as a download. */
export interface DownloadFile { name: string; blob: Blob }

export type DiagramImageType = 'image/png' | 'image/jpeg' | 'image/webp' | 'image/svg+xml'

const BY_EXT: Record<string, DiagramImageType> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  svg: 'image/svg+xml',
}

const splitExt = (name: string): [string, string] => {
  const dot = name.lastIndexOf('.')
  return dot > 0 ? [name.slice(0, dot), name.slice(dot + 1)] : [name, '']
}

/**
 * The name of the image file a diagram references in the text (the last part
 * of its path, decoded); a drawing with no file (a data URL) is numbered.
 */
export function imageFileName(src: string, index: number): string {
  if (src.startsWith('data:')) return `diagram-${index + 1}.svg`
  const path = src.split(/[?#]/)[0]
  let last = path.slice(path.lastIndexOf('/') + 1)
  try {
    last = decodeURIComponent(last)
  } catch {
    // a malformed escape: keep the name as written
  }
  return last.slice(last.lastIndexOf('/') + 1) || `diagram-${index + 1}.png`
}

/**
 * The name and format of a regenerated diagram: the same name and extension
 * when the browser can draw that format (PNG, JPEG, WebP, SVG), else a PNG of
 * the same name (GIF, BMP… cannot be encoded by a canvas).
 */
export function regeneratedFileName(fileName: string): { name: string; type: DiagramImageType } {
  const [base, ext] = splitExt(fileName)
  const type = BY_EXT[ext.toLowerCase()]
  return type ? { name: fileName, type } : { name: `${base}.png`, type: 'image/png' }
}

/** The evaluation file of a diagram: named after the image it follows. */
export const textFileName = (fileName: string) => `${splitExt(fileName)[0]}.txt`

/** Names made unique (a-2.png, a-3.png…) so two downloads never overwrite each other. */
export function uniqueNames(names: string[]): string[] {
  const seen = new Map<string, number>()
  return names.map((name) => {
    const n = (seen.get(name) ?? 0) + 1
    seen.set(name, n)
    if (n === 1) return name
    const [base, ext] = splitExt(name)
    return ext ? `${base}-${n}.${ext}` : `${base}-${n}`
  })
}

/**
 * The position a book image shows and whether it is really known: the FEN the
 * diagram carries (data-fen), the FEN line the text prints next to it
 * (data-text-fen), or the position after the last recognised move before it
 * (`inferred`, from inferDiagramFen). With no move before the image the
 * inferred position is only the initial one: not known.
 */
export function diagramFenOf(img: Element, inferred: string): { fen: string; known: boolean } {
  const own = img.getAttribute('data-fen') || img.getAttribute('data-text-fen')
  if (own) return { fen: own, known: true }
  return { fen: inferred, known: inferred !== INITIAL_FEN }
}

/** Every diagram of the text, in order (DiagramImage marks its root with its image and position). */
export function collectDiagrams(root: ParentNode = document): DiagramRef[] {
  return Array.from(root.querySelectorAll('[data-diagram-src]')).map((el, i) => {
    const src = el.getAttribute('data-diagram-src') ?? ''
    return { src, fen: el.getAttribute('data-diagram-fen') ?? INITIAL_FEN, fileName: imageFileName(src, i) }
  })
}

/**
 * A regenerated diagram as a file: the SVG drawing itself, or that drawing
 * painted on a canvas and encoded as PNG / JPEG / WebP (white background, as
 * JPEG has no transparency).
 */
export async function renderDiagramBlob(fen: string, type: DiagramImageType, size = 480): Promise<Blob> {
  const svg = generatedDiagramSvg(fen, size)
  if (type === 'image/svg+xml') return new Blob([svg], { type })
  const img = new Image()
  img.decoding = 'async'
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve()
    img.onerror = () => reject(new Error('Could not draw the diagram'))
    img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
  })
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('No canvas')
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, size, size)
  ctx.drawImage(img, 0, 0, size, size)
  return new Promise<Blob>((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Could not encode the diagram'))), type, 0.92),
  )
}

/** Hand one file to the browser as a download. */
export function downloadBlob(name: string, blob: Blob): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.style.display = 'none'
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

/**
 * Download several files one after another (there is no zip library in the
 * app): a short pause between them keeps the browser from dropping any.
 */
export async function downloadFiles(files: DownloadFile[], pauseMs = 250): Promise<void> {
  for (let i = 0; i < files.length; i++) {
    downloadBlob(files[i].name, files[i].blob)
    if (i < files.length - 1) await new Promise((r) => setTimeout(r, pauseMs))
  }
}
