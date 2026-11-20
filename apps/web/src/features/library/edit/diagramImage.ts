import { boardSvgDataUrl } from '../utils/boardSvg'

/**
 * The image of an inserted diagram (S8). A PNG data URL is kept when the
 * suggestion is applied (the server turns it into an EPUB image); an SVG data
 * URL is not, so the SVG is only the fallback when no canvas can draw it or the
 * PNG would not fit in a suggestion (64 KB of JSON).
 */
const MAX_PNG = 45_000
const SIZE = 320

export async function diagramImageSrc(fen: string): Promise<string> {
  const svg = boardSvgDataUrl(fen)
  try {
    const img = new Image()
    img.src = svg
    await img.decode()
    const canvas = document.createElement('canvas')
    canvas.width = SIZE
    canvas.height = SIZE
    const ctx = canvas.getContext('2d')
    if (!ctx) return svg
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, SIZE, SIZE)
    ctx.drawImage(img, 0, 0, SIZE, SIZE)
    const png = canvas.toDataURL('image/png')
    return png.startsWith('data:image/png;base64,') && png.length <= MAX_PNG ? png : svg
  } catch {
    return svg
  }
}
