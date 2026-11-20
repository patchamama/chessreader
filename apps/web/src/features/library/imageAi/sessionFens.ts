import { create } from 'zustand'

/**
 * Diagram FENs accepted in the reader this session (keyed by image src), until
 * the diagram-fen suggestion is accepted and applied on load or written into
 * the EPUB. `withSessionFens` puts them in a chapter's HTML the way a printed
 * FEN is: on the image (data-fen) and as a hidden FEN line right after its
 * block, so the recogniser starts the following moves from that position.
 */
interface SessionFenState {
  fens: Record<string, string>
  setFen: (src: string, fen: string) => void
}

export const useSessionFenStore = create<SessionFenState>((set) => ({
  fens: {},
  setFen: (src, fen) => set((s) => ({ fens: { ...s.fens, [src]: fen } })),
}))

const BLOCK = 'p, h1, h2, h3, h4, h5, h6, li, pre, blockquote, figure, div'

/** The chapter HTML with the session FENs of its images; unchanged when none applies. */
export function withSessionFens(html: string, fens: Record<string, string>): string {
  if (!html || !Object.keys(fens).length) return html
  const doc = new DOMParser().parseFromString(html, 'text/html')
  let changed = false
  for (const img of Array.from(doc.body.querySelectorAll('img'))) {
    const fen = fens[img.getAttribute('src') ?? '']
    // A FEN the book prints next to the diagram is the book's word.
    if (!fen || img.hasAttribute('data-text-fen')) continue
    img.setAttribute('data-fen', fen)
    const line = doc.createElement('p')
    line.className = 'epub-fen-hidden'
    line.setAttribute('aria-hidden', 'true')
    line.setAttribute('data-session-fen', '')
    line.textContent = fen
    const block = img.closest(BLOCK)
    if (block && block !== doc.body) block.after(line)
    else img.after(line)
    changed = true
  }
  if (!changed) return html
  const styles = [...doc.head.querySelectorAll('style, link[rel="stylesheet"]')].map((s) => s.outerHTML).join('')
  return styles + doc.body.innerHTML
}
