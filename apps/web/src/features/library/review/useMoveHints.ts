import { useEffect, useState } from 'react'
import { Chess } from 'chess.js'
import { qualityFromAnnotation } from '@chess-ebook/chess-shared'
import type { GameNode, GameTree, MoveQuality } from '@chess-ebook/chess-shared'
import type { EngineLine } from '../../../shared/stockfish/useEngineLines'
import { useSettingsStore, STOCKFISH_VERSIONS } from '../../../shared/settings/settingsStore'
import { hintsForSquare, type MoveHint } from './reviewEngine'
import { reviewEngine, useReviewStore } from './reviewStore'

const HINT_DEPTH = 8
/** Engine lines for every legal move, per position (shared by all pieces of that position). */
const cache = new Map<string, Promise<EngineLine[]>>()

/**
 * Help mode: how good each destination of the selected piece is. The engine
 * rates every legal move of the position once (shallow, all moves at a time);
 * selecting another piece of the same position is then instant.
 */
export function useMoveHints(fen: string, square: string | null, enabled: boolean): Record<string, MoveHint> {
  const sfUrl = STOCKFISH_VERSIONS[useSettingsStore((s) => s.stockfishVersion)].url
  const [hints, setHints] = useState<{ key: string; value: Record<string, MoveHint> }>({ key: '', value: {} })
  const key = enabled && square ? `${fen}|${square}` : ''

  useEffect(() => {
    if (!key || !square) return
    let live = true
    let lines = cache.get(fen)
    if (!lines) {
      let count = 1
      try { count = new Chess(fen).moves().length } catch { /* not a playable position */ }
      if (count === 0) return
      lines = reviewEngine(sfUrl)(fen, HINT_DEPTH, count)
      cache.set(fen, lines)
      if (cache.size > 40) cache.delete(cache.keys().next().value as string)
    }
    void lines.then((l) => { if (live) setHints({ key, value: hintsForSquare(l, fen, square) }) })
    return () => { live = false }
  }, [key, fen, square, sfUrl])

  return key && hints.key === key ? hints.value : EMPTY
}
const EMPTY: Record<string, MoveHint> = {}

/** Test hook: forget cached positions. */
export function clearMoveHintCache() {
  cache.clear()
}

/** How good a move of the game is: the mark the text gives it, else the engine review. */
export function nodeQuality(tree: GameTree, node: GameNode): MoveQuality | undefined {
  const mark = /(\?\?|!!|\?!|!\?|\?|!)\s*$/.exec(node.rawSan ?? '')?.[1]
  const written = mark ? qualityFromAnnotation(mark) : undefined
  if (written) return written
  return useReviewStore.getState().byTree.get(tree)?.review.moves.find((m) => m.nodeId === node.id)?.quality
}
