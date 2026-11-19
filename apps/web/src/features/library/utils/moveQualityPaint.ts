import { CUE_COLORS } from '../narration/cueStyles'
import type { MoveHint } from '../review/reviewEngine'

/**
 * Colour each move span of the text by its evaluation (reader-analysis-round
 * S11), with the colours of the board's move hints: `qualitiesFor` gives the
 * rating of each move of a game (node id → hint), null when it has none. Spans
 * of moves without a rating lose any colour given before.
 */
export function paintMoveQualities(
  root: ParentNode,
  qualitiesFor: ((gameIndex: number) => Record<string, MoveHint> | null) | null,
): void {
  const cache = new Map<number, Record<string, MoveHint> | null>()
  root.querySelectorAll<HTMLElement>('span[data-node-id]').forEach((span) => {
    const gameIndex = Number(span.dataset.gameIndex)
    const nodeId = (span.dataset.nodeId ?? '').slice((span.dataset.nodeId ?? '').indexOf(':') + 1)
    let qualities: Record<string, MoveHint> | null = null
    if (qualitiesFor) {
      if (!cache.has(gameIndex)) cache.set(gameIndex, qualitiesFor(gameIndex))
      qualities = cache.get(gameIndex) ?? null
    }
    const hint = qualities?.[nodeId]
    if (hint) {
      span.setAttribute('data-eval-quality', hint)
      span.style.color = CUE_COLORS[hint]
      span.style.boxShadow = `inset 0 -2px 0 ${CUE_COLORS[hint]}`
    } else if (span.hasAttribute('data-eval-quality')) {
      span.removeAttribute('data-eval-quality')
      span.style.color = ''
      span.style.boxShadow = ''
    }
  })
}
