import { useSettingsStore } from '../../../shared/settings/settingsStore'
import { applyErrataToHtml } from './errataApply'
import { fetchChapterErrata } from './errataSource'
import type { ErrataEntry } from './errataFormat'

/** What useChapter adds to a chapter: the book's title and the errata written into its text. */
export interface ChapterErrata {
  bookTitle: string | null
  applied: ErrataEntry[]
}

/**
 * A chapter's HTML with the errata of its book and chapter applied to the
 * main lines. Any failure leaves the HTML as it is: errata never block reading.
 */
export async function withChapterErrata(html: string, bookTitle: string | null, chapter: number): Promise<{ html: string; errata: ChapterErrata }> {
  const none = { html, errata: { bookTitle, applied: [] } }
  if (!bookTitle) return none
  try {
    const entries = await fetchChapterErrata(bookTitle, chapter)
    if (!entries.length) return none
    const algorithm = useSettingsStore.getState().recognitionAlgorithm
    const out = applyErrataToHtml(html, entries, { algorithm })
    return { html: out.html, errata: { bookTitle, applied: out.applied ? entries : [] } }
  } catch {
    return none
  }
}
