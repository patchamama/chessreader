/**
 * Book images as pixels (template reader) and as data URLs (vision models).
 * Images are same-origin (/api/library/books/{id}/images/…) or blob/data URLs,
 * so the canvas is never tainted.
 */

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.decoding = 'async'
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('The image could not be loaded'))
    img.src = src
  })
}

async function canvasOf(src: string, maxSide: number): Promise<HTMLCanvasElement> {
  const img = await loadImage(src)
  const w = img.naturalWidth || img.width, h = img.naturalHeight || img.height
  if (!w || !h) throw new Error('The image is empty')
  const scale = Math.min(1, maxSide / Math.max(w, h))
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(w * scale))
  canvas.height = Math.max(1, Math.round(h * scale))
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('No canvas')
  // Paper is white: a transparent PNG must not read as black.
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
  return canvas
}

/** The image's pixels (at most maxSide pixels on its longer side). */
export async function imageDataOf(src: string, maxSide = 640): Promise<ImageData> {
  const canvas = await canvasOf(src, maxSide)
  return canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height)
}

/** The image as a PNG data URL for a vision model. */
export async function imageDataUrl(src: string, maxSide = 1024): Promise<string> {
  return (await canvasOf(src, maxSide)).toDataURL('image/png')
}
