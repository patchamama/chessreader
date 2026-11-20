/**
 * The diagrams on screen (one entry per mounted DiagramImage), for the actions
 * that look at more than one: per-book templates and the chapter batch.
 */
export interface DiagramEntry {
  id: number
  src: string
  /** The text printed after the diagram (its following moves). */
  followingText: string
  /** The FEN the book prints next to it, if any. */
  printedFen?: string
  element: HTMLElement | null
}

const entries = new Map<number, DiagramEntry>()
let next = 1

export function registerDiagram(entry: Omit<DiagramEntry, 'id'>): () => void {
  const id = next++
  entries.set(id, { ...entry, id })
  return () => { entries.delete(id) }
}

/** The diagrams on screen, in reading order. */
export function registeredDiagrams(): DiagramEntry[] {
  return [...entries.values()].sort((a, b) => {
    if (!a.element || !b.element || a.element === b.element) return a.id - b.id
    return a.element.compareDocumentPosition(b.element) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1
  })
}

/** The book an image belongs to: its id in /api/library/books/{id}/…, else the whole session. */
export function bookKeyOf(src: string): string {
  return /\/api\/library\/books\/(\d+)\//.exec(src)?.[1] ?? 'session'
}
