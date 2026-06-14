import type { PieceTheme } from '../../settings/settingsStore'
import type { PieceRenderSet } from './types'
import { alphaSet } from './alphaSet'
import { meridaSet } from './meridaSet'
import { getSvgSet } from './svgSets'

export { PIECE_CODES } from './types'
export type { PieceRenderSet, PieceCode } from './types'
export { SVG_SET_NAMES } from './svgSets'

/**
 * Resolve a piece theme to a react-chessboard `pieces` render object.
 * Returns `null` for the `default` theme so the board keeps the library's
 * built-in pieces (no override). `alpha` and `merida` are hand-built JSX sets;
 * every other named theme is loaded from its inlined SVG folder.
 */
export function getPieceSet(theme: PieceTheme): PieceRenderSet | null {
  switch (theme) {
    case 'default':
      return null
    case 'alpha':
      return alphaSet
    case 'merida':
      return meridaSet
    default:
      return getSvgSet(theme)
  }
}
