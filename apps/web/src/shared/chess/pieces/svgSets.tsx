import type { PieceRenderSet, PieceCode } from './types'
import { PIECE_CODES } from './types'

/**
 * SVG piece sets sourced verbatim from the lichess (lila) public asset library
 * — GPLv2/free sets under apps/web/src/shared/chess/pieces/assets/<set>/<code>.svg.
 *
 * Vite's `import.meta.glob(..., { query: '?raw', eager: true })` inlines every
 * SVG as a raw string at build time, so we never hand-transcribe geometry.
 * Each piece renders the SVG markup directly via dangerouslySetInnerHTML.
 */
const RAW = import.meta.glob('./assets/*/*.svg', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>

/** Build `{ set: { code: markup } }` from the glob keys (./assets/leipzig/wN.svg). */
function indexBySet(): Record<string, Partial<Record<PieceCode, string>>> {
  const out: Record<string, Partial<Record<PieceCode, string>>> = {}
  for (const [path, markup] of Object.entries(RAW)) {
    const m = path.match(/\.\/assets\/([^/]+)\/([^/]+)\.svg$/)
    if (!m) continue
    const [, set, code] = m
    ;(out[set] ??= {})[code as PieceCode] = markup
  }
  return out
}

const BY_SET = indexBySet()

/** The set names that have a full 12-piece SVG folder available. */
export const SVG_SET_NAMES = Object.keys(BY_SET).filter((set) =>
  PIECE_CODES.every((code) => BY_SET[set][code]),
)

function makeRenderSet(set: string): PieceRenderSet {
  const pieces = BY_SET[set]
  return Object.fromEntries(
    PIECE_CODES.map((code) => {
      const markup = pieces[code] ?? ''
      const Piece = () => (
        <span
          aria-hidden="true"
          style={{ display: 'block', width: '100%', height: '100%' }}
          dangerouslySetInnerHTML={{ __html: markup }}
        />
      )
      return [code, Piece]
    }),
  )
}

/** Lazily-built render sets keyed by set name (only built once per set). */
const cache = new Map<string, PieceRenderSet>()

export function getSvgSet(set: string): PieceRenderSet | null {
  if (!BY_SET[set]) return null
  if (!cache.has(set)) cache.set(set, makeRenderSet(set))
  return cache.get(set)!
}
