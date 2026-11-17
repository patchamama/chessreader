import { BOARD_THEMES, useSettingsStore, type PieceTheme } from '../../../shared/settings/settingsStore'
import { pieceMarkup } from '../../../shared/chess/pieces/pieceMarkup'
import type { PieceCode } from '../../../shared/chess/pieces'

export interface BoardSvgOptions {
  light?: string
  dark?: string
  pieces?: PieceTheme
}

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
  const light = options.light ?? theme.light
  const dark = options.dark ?? theme.dark
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
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}">${squares.join('')}${men.join('')}</svg>`
}

function square(r: number, f: number, cell: number, light: string, dark: string): string {
  return `<rect x="${f * cell}" y="${r * cell}" width="${cell}" height="${cell}" fill="${(r + f) % 2 === 0 ? light : dark}"/>`
}

export const boardSvgDataUrl = (fen: string) => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(boardSvg(fen))}`
