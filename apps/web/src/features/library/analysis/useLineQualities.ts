import { useEffect, useState } from 'react'
import { Chess } from 'chess.js'
import type { GameTree, MoveQuality } from '@chess-ebook/chess-shared'
import { useSettingsStore, STOCKFISH_VERSIONS } from '../../../shared/settings/settingsStore'
import type { EngineLine } from '../../../shared/stockfish/useEngineLines'
import { hintsForSquare, type MoveHint } from '../review/reviewEngine'
import { reviewEngine } from '../review/reviewStore'
import { nodeQuality } from '../review/useMoveHints'

/** Same depth as the move hints of the board: a move listed gets the colour its square had. */
const HINT_DEPTH = 8
const cache = new Map<string, Promise<EngineLine[]>>()

/** The colour scale of the move hints (good / dubious / bad) for a quality of the review or the text. */
export function hintOfQuality(q: MoveQuality): MoveHint {
  return q === 'mistake' || q === 'blunder' ? 'bad' : q === 'good' || q === 'brilliant' ? 'good' : 'dubious'
}

function linesOf(fen: string, sfUrl: string): Promise<EngineLine[]> {
  let lines = cache.get(fen)
  if (!lines) {
    let count = 1
    try { count = new Chess(fen).moves().length } catch { /* not a playable position */ }
    lines = count === 0 ? Promise.resolve([]) : reviewEngine(sfUrl)(fen, HINT_DEPTH, count)
    cache.set(fen, lines)
    if (cache.size > 200) cache.delete(cache.keys().next().value as string)
  }
  return lines
}

/**
 * How good each move of a line is, on the scale the board's move hints use
 * (the mark the text gives it, else the engine's look at every move of the
 * position before it). Rated one move after another; off with the move hints.
 */
export function useLineQualities(tree: GameTree | null, ids: string[]): Record<string, MoveHint> {
  const enabled = useSettingsStore((s) => s.moveHints)
  const sfUrl = STOCKFISH_VERSIONS[useSettingsStore((s) => s.stockfishVersion)].url
  const [rated, setRated] = useState<{ tree: GameTree | null; value: Record<string, MoveHint> }>({ tree: null, value: {} })
  const key = ids.join(',')

  useEffect(() => {
    if (!tree || !enabled) return
    let live = true
    void (async () => {
      const value: Record<string, MoveHint> = {}
      for (const id of key ? key.split(',') : []) {
        const node = tree.nodes.get(id)
        if (!node?.from || !node.to) continue
        const written = nodeQuality(tree, node)
        if (written) value[id] = hintOfQuality(written)
        else {
          const before = node.parentId ? tree.nodes.get(node.parentId)?.fen ?? tree.startFen : tree.startFen
          const lines = await linesOf(before, sfUrl).catch(() => [] as EngineLine[])
          if (!live) return
          const hint = lines.length ? hintsForSquare(lines, before, node.from)[node.to] : undefined
          if (hint) value[id] = hint
        }
        if (live) setRated({ tree, value: { ...value } })
      }
    })()
    return () => { live = false }
  }, [tree, key, enabled, sfUrl])

  return enabled && rated.tree === tree ? rated.value : EMPTY
}
const EMPTY: Record<string, MoveHint> = {}

/** Test hook: forget the rated positions. */
export function clearLineQualityCache() {
  cache.clear()
}
