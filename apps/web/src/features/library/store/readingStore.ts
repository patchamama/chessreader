/** Reading progress persisted to localStorage, keyed by bookId. */
export interface ReadingProgress {
  chapter: number
  lastOpenedAt: string // ISO string
}

const KEY = (bookId: number) => `reading-progress-${bookId}`

export function getProgress(bookId: number): ReadingProgress | null {
  try {
    const raw = localStorage.getItem(KEY(bookId))
    return raw ? (JSON.parse(raw) as ReadingProgress) : null
  } catch {
    return null
  }
}

export function saveProgress(bookId: number, chapter: number) {
  const data: ReadingProgress = { chapter, lastOpenedAt: new Date().toISOString() }
  localStorage.setItem(KEY(bookId), JSON.stringify(data))
}

const SCROLL_KEY = 'reading-scroll-v1'

function readScrolls(): Record<string, number> {
  try {
    return JSON.parse(localStorage.getItem(SCROLL_KEY) ?? '{}') as Record<string, number>
  } catch {
    return {}
  }
}

/** The saved scroll position of a chapter, or null when it was never opened. */
export function getChapterScroll(bookId: number, chapter: number): number | null {
  const v = readScrolls()[`${bookId}:${chapter}`]
  return typeof v === 'number' ? v : null
}

/** Remember where the reader is in a chapter. */
export function saveChapterScroll(bookId: number, chapter: number, top: number): void {
  try {
    localStorage.setItem(SCROLL_KEY, JSON.stringify({ ...readScrolls(), [`${bookId}:${chapter}`]: Math.max(0, Math.round(top)) }))
  } catch {
    /* not kept */
  }
}
