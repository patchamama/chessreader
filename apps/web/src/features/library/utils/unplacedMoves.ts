import type { RecognizedGame } from '@chess-ebook/chess-shared'
import { extractProseText, piecesByTextNode } from './proseText'

const CLASS = 'rounded px-0.5 underline decoration-wavy decoration-red-500 decoration-2'

/**
 * Underlines in red the moves written inside a variation that could not be
 * placed (chess-shared `GameTree.unplacedVariationMoves`). Positional: the
 * offsets come from the prose text the recogniser read. They carry no board
 * position, so there is no click behaviour. Run after the move spans exist.
 */
export function paintUnplacedMoves(container: HTMLElement, games: RecognizedGame[]): void {
  const targets = games.flatMap((g) =>
    (g.tree.unplacedVariationMoves ?? []).map((m) => ({ start: m.charStart, end: m.charEnd, san: m.rawSan ?? m.san })),
  )
  if (targets.length === 0) return
  const prose = extractProseText(container)
  const pieces = piecesByTextNode(prose.map, targets)
  for (const [textNode, list] of pieces) {
    // Never paint over a span already standing for a move / square / reference.
    if (textNode.parentElement?.closest('[data-san], [data-iso-square], [data-ref-key]')) continue
    const text = textNode.nodeValue ?? ''
    const frag = document.createDocumentFragment()
    let cursor = 0
    for (const piece of list) {
      if (piece.start < cursor) continue
      if (piece.start > cursor) frag.appendChild(document.createTextNode(text.slice(cursor, piece.start)))
      const span = document.createElement('span')
      span.textContent = text.slice(piece.start, piece.end)
      span.setAttribute('data-unplaced', '1')
      span.setAttribute('data-raw', span.textContent)
      span.className = CLASS
      span.title = `Move not found in the variation: ${piece.target.san} (it is not legal here)`
      frag.appendChild(span)
      cursor = piece.end
    }
    if (cursor < text.length) frag.appendChild(document.createTextNode(text.slice(cursor)))
    textNode.parentNode?.replaceChild(frag, textNode)
  }
}
