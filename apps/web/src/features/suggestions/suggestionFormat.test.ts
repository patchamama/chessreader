import { describe, it, expect } from 'vitest'
import { buildSuggestion, makeAnchor, newSuggestionId, normalizeQuote, suggestionPath, validateSuggestion, SUGGESTION_KINDS } from './suggestionFormat'

describe('suggestionFormat', () => {
  it('builds a pending suggestion with a valid id and date', () => {
    const s = buildSuggestion({ kind: 'text', target: { book: 'Sample Book', chapter: 2 }, before: 'a', after: 'b', author: 'user' })
    expect(s.status).toBe('pending')
    expect(s.id).toMatch(/^text-[A-Za-z0-9._-]+$/)
    expect(Number.isNaN(Date.parse(s.createdAt))).toBe(false)
    expect(validateSuggestion(s)).toEqual([])
  })

  it('makes unique ids of at most 120 characters', () => {
    const ids = new Set(Array.from({ length: 50 }, () => newSuggestionId('diagram-fen')))
    expect(ids.size).toBe(50)
    for (const id of ids) expect(id.length).toBeLessThanOrEqual(120)
  })

  it('anchors a block by chapter, index and the first 40 characters of its normalised text', () => {
    const text = '  The  first   words\nof a placeholder paragraph that is long enough  '
    const a = makeAnchor(4, 12, text)
    expect(a).toEqual({ chapter: 4, blockIndex: 12, quote: normalizeQuote(text) })
    expect(a.quote).toHaveLength(40)
    expect(a.quote.startsWith('The first words of a')).toBe(true)
  })

  it('stores a suggestion under suggestions/<kind>/<book-slug>/<id>.json', () => {
    const s = buildSuggestion({ kind: 'image', target: { book: 'Mis Libros Ñandú' }, before: null, after: { src: 'x.png' }, author: 'ai', model: 'm' })
    expect(suggestionPath(s)).toBe(`suggestions/image/mis-libros-nandu/${s.id}.json`)
  })

  it('reports invalid suggestions like the server does', () => {
    const s = buildSuggestion({ kind: 'text', target: { book: 'Book' }, before: '', after: 'x', author: 'user' })
    expect(validateSuggestion({ ...s, kind: 'script' })).not.toEqual([])
    expect(validateSuggestion({ ...s, id: '../x' })).not.toEqual([])
    expect(validateSuggestion({ ...s, target: { book: '---' } })).not.toEqual([])
    expect(validateSuggestion({ ...s, author: 'robot' })).not.toEqual([])
    expect(validateSuggestion({ ...s, after: 'x'.repeat(70_000) })).not.toEqual([])
    expect(validateSuggestion(null)).not.toEqual([])
    expect(SUGGESTION_KINDS).toContain('diagram-fen')
  })
})
