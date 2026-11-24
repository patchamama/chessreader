import { pieceMarkup } from '../../../shared/chess/pieces/pieceMarkup'
import type { PieceCode } from '../../../shared/chess/pieces'
import type { PieceTheme } from '../../../shared/settings/settingsStore'
import { asSvgFile, textToBase64 } from './diagramSvg'

export const COVER_W = 600
export const COVER_H = 900

export interface CoverDesign { id: string; label: string; svg: string }
export interface CoverImage { mime: string; data: string }

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

/** Break a title into lines of at most `max` characters (a long word keeps its own line). */
export function wrapText(text: string, max: number, maxLines = 5): string[] {
  const lines: string[] = []
  let line = ''
  for (const word of text.trim().split(/\s+/).filter(Boolean)) {
    if (line && `${line} ${word}`.length > max) { lines.push(line); line = word } else line = line ? `${line} ${word}` : word
  }
  if (line) lines.push(line)
  if (lines.length > maxLines) { const rest = lines.splice(maxLines - 1).join(' '); lines.push(rest.length > max ? `${rest.slice(0, max - 1)}…` : rest) }
  return lines
}

let seq = 0

/** A piece placed on the cover; ids are made unique so two pieces never share a gradient. */
function piece(theme: PieceTheme, code: PieceCode, x: number, y: number, size: number): string {
  const tag = `c${++seq}${code}`
  return pieceMarkup(theme, code)
    .replace(/\sid="([^"]+)"/g, ` id="${tag}-$1"`)
    .replace(/url\(#([^)]+)\)/g, `url(#${tag}-$1)`)
    .replace(/(xlink:)?href="#([^"]+)"/g, (_m, p: string | undefined, id: string) => `${p ?? ''}href="#${tag}-${id}"`)
    .replace(/^<svg\b([^>]*)>/, (_m, attrs: string) => `<svg x="${x}" y="${y}" width="${size}" height="${size}"${attrs.replace(/\s(width|height|style|x|y)="[^"]*"/g, '')}>`)
}

function checker(x: number, y: number, cell: number, n: number, light: string, dark: string): string {
  const out: string[] = []
  for (let r = 0; r < n; r++) for (let f = 0; f < n; f++) out.push(`<rect x="${x + f * cell}" y="${y + r * cell}" width="${cell}" height="${cell}" fill="${(r + f) % 2 === 0 ? light : dark}"/>`)
  return out.join('')
}

function titleBlock(title: string, author: string, color: string, sub: string, y0: number, yAuthor: number): string {
  const lines = wrapText(title, 18)
  const size = lines.length > 3 ? 44 : lines.length > 2 ? 52 : 60
  const t = lines.map((l, i) => `<text x="300" y="${y0 + i * (size + 10)}" font-size="${size}" font-weight="700" fill="${color}" text-anchor="middle" font-family="Georgia, 'Times New Roman', serif">${esc(l)}</text>`).join('')
  const a = author ? `<text x="300" y="${yAuthor}" font-size="32" fill="${sub}" text-anchor="middle" font-family="Georgia, 'Times New Roman', serif">${esc(author)}</text>` : ''
  return t + a
}

const wrap = (inner: string) => `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 ${COVER_W} ${COVER_H}" width="${COVER_W}" height="${COVER_H}">${inner}</svg>`

/** Several cover designs for a title and an author: a chessboard or large pieces behind the text. */
export function coverDesigns(title: string, author: string, pieces: PieceTheme = 'cburnett' as PieceTheme): CoverDesign[] {
  return [
    {
      id: 'board', label: 'Chessboard',
      svg: wrap(`<rect width="600" height="900" fill="#1f2937"/>${checker(60, 380, 60, 8, '#f0d9b5', '#b58863')}<rect x="60" y="380" width="480" height="480" fill="none" stroke="#f9fafb" stroke-width="4"/>${titleBlock(title, author, '#f9fafb', '#d1d5db', 110, 300)}`),
    },
    {
      id: 'king', label: 'King and queen',
      svg: wrap(`<rect width="600" height="900" fill="#f5efe0"/><rect x="24" y="24" width="552" height="852" fill="none" stroke="#7c5a3a" stroke-width="3"/>${piece(pieces, 'wK', 60, 480, 270)}${piece(pieces, 'bQ', 270, 480, 270)}${titleBlock(title, author, '#3b2a1a', '#7c5a3a', 150, 400)}<rect x="60" y="760" width="480" height="3" fill="#7c5a3a"/>`),
    },
    {
      id: 'knight', label: 'Knight',
      svg: wrap(`<defs><linearGradient id="g${seq + 1}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#0f3d2e"/><stop offset="1" stop-color="#1b6b4f"/></linearGradient></defs><rect width="600" height="900" fill="url(#g${seq + 1})"/>${piece(pieces, 'wN', 100, 420, 400)}${titleBlock(title, author, '#ffffff', '#c7e9d6', 130, 810)}`),
    },
    {
      id: 'pawns', label: 'Pawns and board corner',
      svg: wrap(`<rect width="600" height="900" fill="#eef2ff"/>${checker(0, 540, 75, 8, '#eef2ff', '#6366f1').replace(/<rect /g, '<rect opacity="0.9" ')}${[0, 1, 2, 3, 4, 5, 6, 7].map((i) => piece(pieces, i % 2 ? 'bP' : 'wP', i * 75, 465, 75)).join('')}${titleBlock(title, author, '#1e1b4b', '#4338ca', 150, 400)}`),
    },
  ]
}

/** An SVG design as the cover image of the payload: a PNG drawn in the browser, or the SVG itself when that fails. */
export async function renderCover(svg: string, size = { w: COVER_W, h: COVER_H }, timeoutMs = 8000): Promise<CoverImage> {
  const file = asSvgFile(svg)
  try {
    const url = URL.createObjectURL(new Blob([file], { type: 'image/svg+xml' }))
    try {
      const img = new Image()
      img.width = size.w
      img.height = size.h
      await new Promise<void>((ok, bad) => {
        const timer = setTimeout(() => bad(new Error('the cover took too long to draw')), timeoutMs)
        img.onload = () => { clearTimeout(timer); ok() }
        img.onerror = () => { clearTimeout(timer); bad(new Error('cannot draw the cover')) }
        img.src = url
      })
      const canvas = document.createElement('canvas')
      canvas.width = size.w
      canvas.height = size.h
      const ctx = canvas.getContext('2d')
      if (!ctx) throw new Error('no canvas')
      ctx.drawImage(img, 0, 0, size.w, size.h)
      const png = canvas.toDataURL('image/png')
      if (!png.startsWith('data:image/png;base64,')) throw new Error('no PNG')
      return { mime: 'image/png', data: png.slice('data:image/png;base64,'.length) }
    } finally { URL.revokeObjectURL(url) }
  } catch {
    return { mime: 'image/svg+xml', data: textToBase64(file) }
  }
}

export const coverDataUrl = (svg: string) => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`

/** A cover chosen from a file: its type and base64 (PNG, JPEG, GIF and WebP only). */
export async function coverFromFile(file: File): Promise<CoverImage> {
  if (!/^image\/(png|jpeg|gif|webp)$/.test(file.type)) throw new Error('Choose a PNG, JPEG, GIF or WebP image')
  const bytes = new Uint8Array(await new Promise<ArrayBuffer>((ok, bad) => {
    const r = new FileReader()
    r.onload = () => ok(r.result as ArrayBuffer)
    r.onerror = () => bad(new Error('Cannot read the image'))
    r.readAsArrayBuffer(file)
  }))
  let bin = ''
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return { mime: file.type, data: btoa(bin) }
}
