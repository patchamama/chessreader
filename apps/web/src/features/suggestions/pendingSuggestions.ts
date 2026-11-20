import { create } from 'zustand'
import { bookSlug } from '../library/errata/errataFormat'
import { applySuggestionsToHtml } from './suggestionApply'
import type { Suggestion } from './suggestionFormat'

/**
 * Suggestions made in the reader this session (S8), shown in place until the
 * page is reloaded: by then they are saved suggestions, and once accepted they
 * come back with the chapter (useChapter → withChapterSuggestions).
 */
export interface PendingEntry {
  suggestion: Suggestion
  /** The HTML to show instead of the suggestion's own (an uploaded image the page cannot read without the token). */
  display?: string
}

interface PendingState {
  items: PendingEntry[]
  add: (suggestion: Suggestion, display?: string) => void
}

export const usePendingSuggestions = create<PendingState>((set) => ({
  items: [],
  add: (suggestion, display) => set((s) => ({ items: [...s.items, display === undefined ? { suggestion } : { suggestion, display }] })),
}))

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

const field = (v: unknown, key: string): string | null => {
  const x = v && typeof v === 'object' ? (v as Record<string, unknown>)[key] : null
  return typeof x === 'string' ? x : null
}

/** The suggestion as it is previewed: accepted, its content wrapped in a pending marker. */
function preview({ suggestion: s, display }: PendingEntry): Suggestion | null {
  const mark = (html: string, tag: 'div' | 'span') => `<${tag} class="pending-suggestion" data-pending-suggestion="${esc(s.id)}">${html}</${tag}>`
  if (s.kind === 'insert') {
    const html = display ?? field(s.after, 'html')
    return html === null ? null : { ...s, status: 'accepted', after: { html: mark(html, 'div') } }
  }
  if (s.kind === 'text') {
    const html = display ?? field(s.after, 'html')
    const text = field(s.after, 'text')
    if (html === null && text === null) return null
    return { ...s, status: 'accepted', after: { html: mark(html ?? esc(text ?? ''), 'span') } }
  }
  return null
}

/** The chapter HTML with the pending suggestions of this book and chapter shown in place; unchanged when none applies. */
export function withPendingSuggestions(html: string, items: PendingEntry[], book: string | null, chapter: number): string {
  if (!html || !book || !items.length) return html
  const slug = bookSlug(book)
  const wanted = items
    .filter(({ suggestion: s }) => bookSlug(s.target.book) === slug && (s.target.anchor?.chapter ?? s.target.chapter) === chapter)
    .map(preview)
    .filter((s): s is Suggestion => s !== null)
  if (!wanted.length) return html
  const out = applySuggestionsToHtml(html, wanted)
  if (!out.applied.length) return html
  // The chapter's stylesheet (in <head>) stays with the content, as withSessionFens keeps it.
  const head = new DOMParser().parseFromString(html, 'text/html').head
  return [...head.querySelectorAll('style, link[rel="stylesheet"]')].map((s) => s.outerHTML).join('') + out.html
}
