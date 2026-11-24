import { BOARD_THEMES, useSettingsStore } from '../../../shared/settings/settingsStore'
import { boardSvg, type DiagramStyle } from '../../library/utils/boardSvg'

/**
 * A diagram as a stand-alone SVG file (for the EPUB): the book style
 * (black and white, hatched dark squares) or the diagram board theme of the
 * menu. The piece drawings use xlink references, so the file declares them.
 */
export function diagramSvgFile(fen: string, style: DiagramStyle, size = 360): string {
  const s = useSettingsStore.getState()
  const pieces = s.diagramPieceTheme ?? s.pieceTheme
  let svg: string
  if (style === 'book') svg = boardSvg(fen, size, { style: 'book', pieces })
  else {
    const theme = BOARD_THEMES[s.diagramBoardTheme] ?? BOARD_THEMES.classic
    svg = boardSvg(fen, size, { light: theme.light, dark: theme.dark, pieces })
  }
  return asSvgFile(svg)
}

/** Make an inline SVG a valid stand-alone file: XML prolog and the xlink namespace. */
export function asSvgFile(svg: string): string {
  const withXlink = /xmlns:xlink=/.test(svg) ? svg : svg.replace(/^<svg\b/, '<svg xmlns:xlink="http://www.w3.org/1999/xlink"')
  return `<?xml version="1.0" encoding="UTF-8"?>\n${withXlink}`
}

/** UTF-8 text as base64 (the payload carries images that way). */
export function textToBase64(text: string): string {
  const bytes = new TextEncoder().encode(text)
  let bin = ''
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(bin)
}
