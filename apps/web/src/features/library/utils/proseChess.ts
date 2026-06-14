import type { GameTree, GameNode } from '@chess-ebook/chess-shared'

/**
 * The node that follows `node` along its own line (mainline or a variation line).
 * Returns null if `node` is the last move of its line.
 */
export function successorOf(tree: GameTree, node: GameNode): string | null {
  const mi = tree.mainline.indexOf(node.id)
  if (mi >= 0) {
    return mi < tree.mainline.length - 1 ? tree.mainline[mi + 1] : null
  }
  for (const lines of tree.variations.values()) {
    for (const line of lines) {
      const i = line.indexOf(node.id)
      if (i >= 0) return i < line.length - 1 ? line[i + 1] : null
    }
  }
  return null
}

/**
 * True when the move's continuation can be replaced by a variation — i.e. the
 * successor node has sibling variation lines branching from the same parent.
 * Drives both the prose underline and the click-to-choose popover.
 */
export function hasAlternativesAhead(tree: GameTree, node: GameNode): boolean {
  const successorId = successorOf(tree, node)
  if (!successorId) return false
  return (tree.variations.get(successorId)?.length ?? 0) > 0
}
