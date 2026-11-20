import { chapterBlocks } from '../../suggestions/suggestionApply'
import { makeAnchor, type SuggestionAnchor } from '../../suggestions/suggestionFormat'
import { movesBeforeImage, type MoveBefore } from '../utils/inferDiagramFen'

/**
 * The blocks of the shown chapter that edit mode can point at (S8). An anchor
 * counts the blocks of the chapter as it was loaded (chapterBlocks of the raw
 * HTML, the same count the suggestions are applied with), so each block of the
 * page is matched, in order, with the raw block of the same text.
 */
export interface EditBlock {
  /** The block on the page. */
  el: Element
  /** Its index among the raw chapter's blocks. */
  index: number
  /** Its text as loaded, whitespace collapsed. */
  text: string
  /** A paragraph, heading or list item: its text can be corrected. */
  textual: boolean
}

const TEXTUAL = new Set(['P', 'LI', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'BLOCKQUOTE'])
const LOOKAHEAD = 30

export const collapse = (s: string) => s.replace(/\s+/g, ' ').trim()
/** The words of a text without the ones holding a digit (moves, move numbers): the same in every notation. */
const loose = (s: string) => s.split(' ').filter((w) => !/\d/.test(w)).join(' ')

/** The text a reader sees in a block, without the diagram overlays the page adds to its images. */
function shownText(el: Element): string {
  if (!el.querySelector('[data-diagram-overlay]')) return collapse(el.textContent ?? '')
  const copy = el.cloneNode(true) as Element
  copy.querySelectorAll('[data-diagram-overlay]').forEach((o) => o.remove())
  return collapse(copy.textContent ?? '')
}

/** The page's blocks matched with the raw chapter's blocks; blocks without a match (added by the reader) are left out. */
export function editBlocks(container: Element, rawHtml: string): EditBlock[] {
  const raw = chapterBlocks(new DOMParser().parseFromString(rawHtml, 'text/html').body).map((b) => collapse(b.textContent ?? ''))
  const rawLoose = raw.map(loose)
  const shown = chapterBlocks(container).filter((el) =>
    !el.closest('[data-pending-suggestion], [data-diagram-overlay]') && !el.hasAttribute('data-session-fen'))
  const out: EditBlock[] = []
  let next = 0
  for (const el of shown) {
    const text = shownText(el)
    const end = Math.min(raw.length, next + LOOKAHEAD)
    let k = raw.indexOf(text, next)
    if (k < 0 || k >= end) {
      // The reader may show the moves in another notation (♗f3 → Bf3): compare the words without moves.
      const key = loose(text)
      // A line of moves only has no words: it is taken for the next raw block when that one is a line of moves too.
      k = key ? rawLoose.indexOf(key, next) : next < raw.length && raw[next] !== '' && rawLoose[next] === '' ? next : -1
    }
    if (k < 0 || k >= end) continue
    out.push({ el, index: k, text: raw[k], textual: TEXTUAL.has(el.tagName) && !el.classList.contains('epub-fen-hidden') })
    next = k + 1
  }
  return out
}

export const anchorOf = (chapter: number, block: EditBlock): SuggestionAnchor => makeAnchor(chapter, block.index, block.text)

/** The moves written before the point right after a block: the last main-line move, and a variation move when one comes last. */
export function movesAfterBlock(
  block: Element,
  container: ParentNode,
  isMainline: (gameIndex: number, nodeId: string) => boolean,
): { main: MoveBefore | null; variation: MoveBefore | null } {
  const marker = block.ownerDocument.createElement('span')
  block.after(marker)
  try {
    return movesBeforeImage(marker, container, isMainline)
  } finally {
    marker.remove()
  }
}
