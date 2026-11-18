import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { BOARD_THEMES, useSettingsStore, type PieceTheme } from '../../../shared/settings/settingsStore'
import { pieceMarkup } from '../../../shared/chess/pieces/pieceMarkup'
import type { PieceCode } from '../../../shared/chess/pieces'

export interface BoardSvgOptions {
  light?: string
  dark?: string
  pieces?: PieceTheme
  /** 'book': white light squares, diagonally hatched dark squares, thin frame. */
  style?: 'book'
}

/**
 * How generated diagrams are drawn: the book style (black and white, hatched
 * dark squares — the default), or the diagram board theme chosen in the menu.
 */
export type DiagramStyle = 'book' | 'theme'
export const BOOK_STYLE_LABEL = 'Book (black & white, hatched dark squares)'

interface DiagramStyleState {
  style: DiagramStyle
  setStyle: (style: DiagramStyle) => void
}

export const useDiagramStyleStore = create<DiagramStyleState>()(
  persist(
    (set) => ({ style: 'book', setStyle: (style) => set({ style }) }),
    { name: 'chessreader-diagram-style', partialize: (s) => ({ style: s.style }) },
  ),
)

const INK = '#000000'
const PAPER = '#ffffff'
let hatchSeq = 0

/**
 * A piece's own SVG placed on a square: its root element becomes a nested
 * <svg> at that square, and its ids are made unique so the gradients of two
 * piece kinds never clash.
 */
function placePiece(markup: string, code: string, x: number, y: number, cell: number): string {
  const prefixed = markup
    .replace(/\sid="([^"]+)"/g, ` id="${code}-$1"`)
    .replace(/url\(#([^)]+)\)/g, `url(#${code}-$1)`)
    .replace(/(xlink:)?href="#([^"]+)"/g, (_m, x: string | undefined, id: string) => `${x ?? ''}href="#${code}-${id}"`)
  return prefixed.replace(/^<svg\b([^>]*)>/, (_m, attrs: string) =>
    `<svg data-piece="${code}" x="${x}" y="${y}" width="${cell}" height="${cell}"${attrs.replace(/\s(width|height|style)="[^"]*"/g, '')}>`)
}

/**
 * A board drawing of a position (SVG, no external images), for diagrams
 * written into a commented game: the colours of the board theme and the piece
 * set chosen in Settings — the same look as the thumbnails. Works offline and
 * in the static demo.
 */
export function boardSvg(fen: string, size = 320, options: BoardSvgOptions = {}): string {
  const s = useSettingsStore.getState()
  const theme = BOARD_THEMES[s.boardTheme] ?? BOARD_THEMES.classic
  const book = options.style === 'book'
  // Each drawing names its own hatch: inline boards on one page never share a pattern.
  const hatchId = book ? `hatch-${++hatchSeq}` : ''
  const light = book ? PAPER : options.light ?? theme.light
  const dark = book ? `url(#${hatchId})` : options.dark ?? theme.dark
  const pieces = options.pieces ?? s.pieceTheme
  const cell = size / 8
  const rows = fen.split(' ')[0].split('/')
  const squares: string[] = []
  const men: string[] = []
  for (let r = 0; r < 8; r++) {
    let f = 0
    for (const ch of rows[r] ?? '') {
      if (/\d/.test(ch)) {
        for (let k = 0; k < Number(ch); k++, f++) squares.push(square(r, f, cell, light, dark))
      } else {
        squares.push(square(r, f, cell, light, dark))
        const code = `${ch === ch.toUpperCase() ? 'w' : 'b'}${ch.toUpperCase()}` as PieceCode
        men.push(placePiece(pieceMarkup(pieces, code), code, f * cell, r * cell, cell))
        f++
      }
    }
  }
  const gap = Math.max(2, cell / 12)
  const defs = book
    ? `<defs><pattern id="${hatchId}" patternUnits="userSpaceOnUse" width="${gap}" height="${gap}" patternTransform="rotate(45)"><rect width="${gap}" height="${gap}" fill="${PAPER}"/><line x1="0" y1="0" x2="0" y2="${gap}" stroke="${INK}" stroke-width="${Math.max(0.6, gap / 3)}"/></pattern></defs>`
    : ''
  const frame = book ? `<rect data-frame="1" x="0.5" y="0.5" width="${size - 1}" height="${size - 1}" fill="none" stroke="${INK}" stroke-width="1"/>` : ''
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}">${defs}${squares.join('')}${men.join('')}${frame}</svg>`
}

function square(r: number, f: number, cell: number, light: string, dark: string): string {
  const isLight = (r + f) % 2 === 0
  return `<rect data-square="${isLight ? 'light' : 'dark'}" x="${f * cell}" y="${r * cell}" width="${cell}" height="${cell}" fill="${isLight ? light : dark}"/>`
}

/**
 * A generated diagram in the chosen style: the book style by default, else the
 * diagram board theme and piece set of the diagram menu.
 */
export function generatedDiagramSvg(fen: string, size = 320): string {
  const s = useSettingsStore.getState()
  const pieces = s.diagramPieceTheme ?? s.pieceTheme
  if (useDiagramStyleStore.getState().style === 'book') return boardSvg(fen, size, { style: 'book', pieces })
  const theme = BOARD_THEMES[s.diagramBoardTheme] ?? BOARD_THEMES.classic
  return boardSvg(fen, size, { light: theme.light, dark: theme.dark, pieces })
}

export const boardSvgDataUrl = (fen: string) => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(generatedDiagramSvg(fen))}`
