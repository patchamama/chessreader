/**
 * Keep the reader's place in a scrolling pane while its content changes size or
 * is replaced: remember what is on screen before, put it back after.
 */

/** A block of the pane and how far into it (0..1) the pane's top edge was. */
export interface ScrollAnchor {
  el: Element
  fraction: number
}

/** The first of `candidates` (in document order) still visible at the pane's top edge. */
export function captureTopAnchor(scroller: Element, candidates: Iterable<Element>): ScrollAnchor | null {
  const top = scroller.getBoundingClientRect().top
  for (const el of candidates) {
    const r = el.getBoundingClientRect()
    if (r.bottom <= top) continue
    const fraction = r.height > 0 ? Math.min(1, Math.max(0, (top - r.top) / r.height)) : 0
    return { el, fraction }
  }
  return null
}

/** Scroll so the same line of the anchored block is back at the pane's top edge. */
export function restoreTopAnchor(scroller: HTMLElement, anchor: ScrollAnchor): void {
  if (!anchor.el.isConnected) return
  const top = scroller.getBoundingClientRect().top
  const r = anchor.el.getBoundingClientRect()
  const delta = r.top + anchor.fraction * r.height - top
  if (delta) scroller.scrollTop += delta
}

/** How far below the pane's top edge an element starts. */
export function captureOffset(scroller: Element, el: Element): number {
  return el.getBoundingClientRect().top - scroller.getBoundingClientRect().top
}

/** Scroll so an element starts again `offset` pixels below the pane's top edge. */
export function restoreOffset(scroller: HTMLElement, el: Element, offset: number): void {
  const delta = captureOffset(scroller, el) - offset
  if (delta) scroller.scrollTop += delta
}
