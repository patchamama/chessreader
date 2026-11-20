import { bookSlug } from '../library/errata/errataFormat'

/**
 * A suggestion: a proposed improvement of a book (a corrected text, a comment,
 * a translation, a move, an image, a diagram FEN, a cover, an inserted block),
 * made by a user or an AI model, reviewed later and finally written into the
 * EPUB. The same shape is stored by the server (POST /api/suggestions) and in
 * the resources repository (suggestions/<kind>/<book-slug>/<id>.json).
 */
export const SUGGESTION_KINDS = ['comment', 'translation', 'game', 'move', 'text', 'image', 'diagram-fen', 'cover', 'insert'] as const
export type SuggestionKind = (typeof SUGGESTION_KINDS)[number]
export const SUGGESTION_STATUSES = ['pending', 'accepted', 'rejected', 'applied'] as const
export type SuggestionStatus = (typeof SUGGESTION_STATUSES)[number]
export type SuggestionOrigin = 'server' | 'resources'

/** A block of a chapter: its index among the chapter's blocks and the first 40 characters of its text. */
export interface SuggestionAnchor {
  chapter: number
  blockIndex: number
  quote: string
}

export interface SuggestionTarget {
  /** The book title (the slug is computed from it). */
  book: string
  chapter?: number
  gameIndex?: number
  commentId?: number | string
  /** The src of the image the suggestion is about (image, diagram-fen). */
  image?: string
  anchor?: SuggestionAnchor
}

export interface Suggestion {
  id: string
  kind: SuggestionKind
  target: SuggestionTarget
  before: unknown
  after: unknown
  author: 'ai' | 'user'
  model?: string
  status: SuggestionStatus
  createdAt: string
  /** Server rows only. */
  updatedAt?: string
  bookSlug?: string
  createdBy?: number | null
}

/** A suggestion as loaded for review: where it came from (the server wins when it is in both). */
export interface LoadedSuggestion extends Suggestion {
  origin: SuggestionOrigin
  origins: SuggestionOrigin[]
}

export const QUOTE_LENGTH = 40
const MAX_VALUE_BYTES = 65536
const ID = /^[A-Za-z0-9._-]{1,120}$/

let counter = 0
export function newSuggestionId(kind: SuggestionKind): string {
  counter = (counter + 1) % 1296
  const rand = Math.random().toString(36).slice(2, 8)
  return `${kind}-${Date.now().toString(36)}-${counter.toString(36)}${rand}`
}

export function buildSuggestion(input: {
  kind: SuggestionKind
  target: SuggestionTarget
  before: unknown
  after: unknown
  author: 'ai' | 'user'
  model?: string
}): Suggestion {
  const s: Suggestion = {
    id: newSuggestionId(input.kind),
    kind: input.kind,
    target: input.target,
    before: input.before ?? null,
    after: input.after,
    author: input.author,
    status: 'pending',
    createdAt: new Date().toISOString(),
  }
  if (input.model) s.model = input.model
  return s
}

/** Whitespace collapsed, trimmed, cut to the quote length. */
export function normalizeQuote(text: string): string {
  return text.replace(/\s+/g, ' ').trim().slice(0, QUOTE_LENGTH)
}

export function makeAnchor(chapter: number, blockIndex: number, text: string): SuggestionAnchor {
  return { chapter, blockIndex, quote: normalizeQuote(text) }
}

/** Where the suggestion lives in the resources repository. */
export function suggestionPath(s: Pick<Suggestion, 'kind' | 'target' | 'id'>): string {
  return `suggestions/${s.kind}/${bookSlug(s.target.book)}/${s.id}.json`
}

const isIndex = (v: unknown, max: number) => Number.isInteger(v) && (v as number) >= 0 && (v as number) <= max
const isText = (v: unknown, max: number) => typeof v === 'string' && v.trim() !== '' && v.length <= max
const bytes = (v: unknown) => new TextEncoder().encode(JSON.stringify(v ?? null)).length

/** The problems of a suggestion, the same checks as the server's SuggestionValidator; [] when valid. */
export function validateSuggestion(value: unknown): string[] {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return ['a suggestion must be an object']
  const s = value as Record<string, unknown>
  const errors: string[] = []
  if (typeof s.id !== 'string' || !ID.test(s.id)) errors.push('id must be 1-120 characters of letters, digits, dot, dash or underscore')
  if (!SUGGESTION_KINDS.includes(s.kind as SuggestionKind)) errors.push(`kind must be one of ${SUGGESTION_KINDS.join(', ')}`)
  const t = s.target as Record<string, unknown> | undefined
  if (!t || typeof t !== 'object' || Array.isArray(t)) {
    errors.push('target must be an object')
  } else {
    if (!isText(t.book, 300) || !bookSlug(String(t.book))) errors.push('target.book (the book title) is required')
    if (t.chapter != null && !isIndex(t.chapter, 2000)) errors.push('target.chapter must be an integer from 0 to 2000')
    if (t.gameIndex != null && !isIndex(t.gameIndex, 1000)) errors.push('target.gameIndex must be an integer from 0 to 1000')
    if (t.image != null && !isText(t.image, 2000)) errors.push('target.image must be a string')
    if (t.anchor != null) {
      const a = t.anchor as Record<string, unknown>
      if (typeof a !== 'object' || !isIndex(a.chapter, 2000) || !isIndex(a.blockIndex, 100000) || typeof a.quote !== 'string' || a.quote.length > 200) {
        errors.push('target.anchor must be {chapter, blockIndex, quote}')
      }
    }
  }
  if (!('after' in s)) errors.push('after is required')
  for (const k of ['before', 'after'] as const) if (bytes(s[k]) > MAX_VALUE_BYTES) errors.push(`${k} must be at most 64 KB of JSON`)
  if (s.author !== 'ai' && s.author !== 'user') errors.push('author must be ai or user')
  if (s.model != null && !isText(s.model, 200)) errors.push('model must be a string')
  if (s.status != null && !SUGGESTION_STATUSES.includes(s.status as SuggestionStatus)) errors.push('status is not valid')
  if (!isText(s.createdAt, 40) || Number.isNaN(Date.parse(String(s.createdAt)))) errors.push('createdAt must be an ISO 8601 date')
  return errors
}
