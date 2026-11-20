import { buildSuggestion, makeAnchor, type SuggestionAnchor, type SuggestionKind } from '../../suggestions/suggestionFormat'
import { chapterBlocks } from '../../suggestions/suggestionApply'
import { saveSuggestion, type SaveSuggestionResult } from '../../suggestions/suggestionsApi'
import { useErrataContext } from '../errata/errataContext'

/** A block's text without the reader's overlays (icons, footers): as in the chapter HTML. */
function bookText(block: Element): string {
  const copy = block.cloneNode(true) as Element
  copy.querySelectorAll('[data-diagram-overlay], [data-image-ai], [data-session-fen], button').forEach((e) => e.remove())
  return copy.textContent ?? ''
}

/**
 * The anchor of the block holding an element (the image's paragraph), counted
 * as the chapter HTML counts blocks: the reader's own additions (game frames,
 * session FEN lines, overlays) left out.
 */
export function anchorOf(el: Element): SuggestionAnchor | undefined {
  const chapter = useErrataContext.getState().chapter
  if (chapter == null) return undefined
  const root = el.closest('.epub-content') ?? el.ownerDocument.body
  const blocks = chapterBlocks(root).filter((b) => !b.closest('[data-game-marker], [data-session-fen]') && !(b.closest('[data-diagram-overlay]') && !b.contains(el)))
  let index = blocks.findIndex((b) => b.contains(el))
  if (index < 0) {
    // Not inside a block: the last block before it.
    index = blocks.reduce((at, b, i) => (b.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_FOLLOWING ? i : at), -1)
  }
  if (index < 0) return undefined
  return makeAnchor(chapter, index, bookText(blocks[index]))
}

export interface ImageSuggestionInput {
  kind: SuggestionKind
  src: string
  element: Element | null
  before: unknown
  after: unknown
  author: 'ai' | 'user'
  model?: string
}

/** Builds and stores a suggestion about a book image (server, else resources repository, else its JSON). */
export function saveImageSuggestion(input: ImageSuggestionInput): Promise<SaveSuggestionResult> {
  const ctx = useErrataContext.getState()
  const anchor = input.element ? anchorOf(input.element) : undefined
  const s = buildSuggestion({
    kind: input.kind,
    target: {
      book: ctx.bookTitle ?? '',
      ...(ctx.chapter != null ? { chapter: ctx.chapter } : {}),
      image: input.src,
      ...(anchor ? { anchor } : {}),
    },
    before: input.before,
    after: input.after,
    author: input.author,
    model: input.model,
  })
  return saveSuggestion(s)
}

/** What the reader is told after saving. */
export function savedMessage(r: SaveSuggestionResult): string {
  if (r.saved) return r.where === 'server' ? 'Suggestion saved on the server.' : 'Suggestion saved in the resources repository.'
  return `Not stored${r.reason ? `: ${r.reason}` : ''}. Download its JSON to add it to the resources repository at ${r.path}.`
}
