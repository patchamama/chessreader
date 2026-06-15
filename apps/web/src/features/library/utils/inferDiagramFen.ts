import type { GameTree } from '@chess-ebook/chess-shared'

export const INITIAL_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'

interface GameLike {
  tree: GameTree
}

/**
 * Infer the position shown in a book diagram image from the MAINLINE moves that
 * precede it in the chapter text.
 *
 * Each mainline node carries the FEN reached AFTER its move plus the character
 * offset where its SAN token appears. We pick the mainline node with the largest
 * `charStart` that is still at or before the image's text offset, and use its FEN.
 * If no mainline move precedes the image, we fall back to the initial position.
 *
 * Only mainline nodes are considered — variation/isolated moves are ignored so a
 * side-line near the image never overrides the actual game position.
 */
export function inferDiagramFen(games: GameLike[], imageOffset: number): string {
  let bestOffset = -1
  let bestFen: string | null = null

  for (const { tree } of games) {
    for (const id of tree.mainline) {
      const node = tree.nodes.get(id)
      if (!node || !node.fen) continue
      const start = node.charStart
      if (start === undefined) continue
      if (start <= imageOffset && start > bestOffset) {
        bestOffset = start
        bestFen = node.fen
      }
    }
  }

  return bestFen ?? INITIAL_FEN
}
