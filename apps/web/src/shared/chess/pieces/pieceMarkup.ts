import type { PieceTheme } from '../../settings/settingsStore'
import type { PieceCode } from './types'

/**
 * Raw SVG markup of each piece, for drawings that are not React (diagram
 * images, exported files). The named sets come from their asset folders; the
 * default, alpha and merida themes draw with cburnett, the classic Lichess set
 * the default board looks like (lila, GPLv2+).
 */
const RAW = import.meta.glob(['./assets/*/*.svg', './cburnett/*.svg'], { query: '?raw', import: 'default', eager: true }) as Record<string, string>

const BY_SET: Record<string, Partial<Record<PieceCode, string>>> = {}
for (const [path, markup] of Object.entries(RAW)) {
  const m = path.match(/\/([^/]+)\/([wb][KQRBNP])\.svg$/)
  if (m) (BY_SET[m[1]] ??= {})[m[2] as PieceCode] = markup
}

/** The markup of one piece (`wN`, `bK`…) in the given theme. */
export function pieceMarkup(theme: PieceTheme, code: PieceCode): string {
  return BY_SET[theme]?.[code] ?? BY_SET.cburnett?.[code] ?? ''
}
