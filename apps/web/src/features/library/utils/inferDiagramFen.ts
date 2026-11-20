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

/** A move written in the text before a diagram: the position after it and how to name it. */
export interface MoveBefore {
  fen: string
  san: string
  moveNumber: number
  color: 'white' | 'black'
}

/**
 * The moves a diagram can show (S14 of llm-assistant-round), read from the move
 * spans of the page in reading order: the last main-line move before the image,
 * and — when the last move before the image belongs to a variation — that
 * variation move too. Marks without a game (gameIndex < 0) are not moves of a game.
 */
export function movesBeforeImage(
  img: Element,
  container: ParentNode,
  isMainline: (gameIndex: number, nodeId: string) => boolean,
): { main: MoveBefore | null; variation: MoveBefore | null } {
  let main: MoveBefore | null = null
  let last: { move: MoveBefore; mainline: boolean } | null = null
  for (const el of Array.from(container.querySelectorAll<HTMLElement>('span[data-node-id]'))) {
    if (!(el.compareDocumentPosition(img) & Node.DOCUMENT_POSITION_FOLLOWING)) break
    const key = el.dataset.nodeId ?? ''
    const sep = key.indexOf(':')
    const gameIndex = Number(key.slice(0, sep))
    const fen = el.dataset.fen
    if (sep < 0 || !Number.isInteger(gameIndex) || gameIndex < 0 || !fen) continue
    const move: MoveBefore = {
      fen,
      san: el.dataset.san ?? el.textContent ?? '',
      moveNumber: Number(el.dataset.moveNumber) || 0,
      color: el.dataset.color === 'black' ? 'black' : 'white',
    }
    const mainline = isMainline(gameIndex, key.slice(sep + 1))
    if (mainline) main = move
    last = { move, mainline }
  }
  return { main, variation: last && !last.mainline ? last.move : null }
}
