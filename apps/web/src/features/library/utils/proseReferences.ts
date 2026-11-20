import { marksToSquares, resolveProseReference } from '@chess-ebook/chess-shared'
import type { GameNode, GameTree, ProseReference, RecognizedGame } from '@chess-ebook/chess-shared'

/** The last move (of any game) written before `offset`, with its game: the position the text talks about. */
export function positionBefore(games: RecognizedGame[], offset: number): { tree: GameTree; node: GameNode } | null {
  let best: { tree: GameTree; node: GameNode } | null = null
  for (const game of games) {
    for (const node of game.tree.nodes.values()) {
      if (node.invalid || node.charEnd === undefined || node.charEnd > offset) continue
      if (!best || node.charEnd > best.node.charEnd!) best = { tree: game.tree, node }
    }
  }
  return best
}

/** The board marks of a reference on `fen`, in the shape of the study board's highlight. */
export function referenceMark(ref: ProseReference, fen: string | null) {
  const marks = resolveProseReference(ref, fen)
  const line = marksToSquares(marks)
  return {
    square: line[0] ?? 'a1',
    piece: 'p' as const,
    line,
    ...(marks.sequence && marks.sequence.length > 0 ? { sequence: marks.sequence } : {}),
    ...(marks.arrows.length > 0 ? { arrows: marks.arrows.map((a): [string, string] => [a.from, a.to]) } : {}),
  }
}

/** Does the user ask for no motion? */
export function prefersReducedMotion(): boolean {
  try { return typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches } catch { return false }
}
