import { describe, it, expect, beforeEach } from 'vitest'
import { buildSuggestion, makeAnchor } from './suggestionFormat'
import { usePendingSuggestions, withPendingSuggestions } from './pendingSuggestions'

const HTML = '<p>First block.</p><p>Second block.</p>'
const parse = (html: string) => new DOMParser().parseFromString(html, 'text/html').body

const insert = (book: string, chapter: number, blockIndex: number, html: string) => buildSuggestion({
  kind: 'insert', target: { book, chapter, anchor: makeAnchor(chapter, blockIndex, blockIndex === 0 ? 'First block.' : 'Second block.') },
  before: null, after: { html }, author: 'user',
})

beforeEach(() => usePendingSuggestions.setState({ items: [] }))

describe('pending suggestions of this session', () => {
  it('keeps what was added', () => {
    const s = insert('B', 1, 0, '<p>x</p>')
    usePendingSuggestions.getState().add(s)
    expect(usePendingSuggestions.getState().items.map((e) => e.suggestion.id)).toEqual([s.id])
  })

  it('writes an insert of the same book and chapter after its block, marked as pending', () => {
    const s = insert('B', 1, 0, '<p>Inserted.</p>')
    const out = parse(withPendingSuggestions(HTML, [{ suggestion: s }], 'B', 1))
    const mark = out.querySelector(`[data-pending-suggestion="${s.id}"]`)!
    expect(mark.textContent).toBe('Inserted.')
    expect(mark.previousElementSibling?.textContent).toBe('First block.')
  })

  it('ignores other books and chapters', () => {
    const items = [{ suggestion: insert('Other', 1, 0, '<p>a</p>') }, { suggestion: insert('B', 2, 0, '<p>b</p>') }]
    expect(withPendingSuggestions(HTML, items, 'B', 1)).toBe(HTML)
    expect(withPendingSuggestions(HTML, items, null, 1)).toBe(HTML)
  })

  it('shows a text correction in its block, escaped and marked', () => {
    const s = buildSuggestion({
      kind: 'text', target: { book: 'B', chapter: 1, anchor: makeAnchor(1, 1, 'Second block.') },
      before: { text: 'Second block.' }, after: { text: 'Second <b>block</b>, fixed.' }, author: 'user',
    })
    const out = parse(withPendingSuggestions(HTML, [{ suggestion: s }], 'B', 1))
    const mark = out.querySelector(`[data-pending-suggestion="${s.id}"]`)!
    expect(mark.textContent).toBe('Second <b>block</b>, fixed.')
    expect(mark.querySelector('b')).toBeNull()
  })

  it('uses the display HTML of an entry for the preview (an uploaded image the page cannot read)', () => {
    const s = insert('B', 1, 1, '<p><img src="/api/suggestions/assets/x.png"></p>')
    const out = parse(withPendingSuggestions(HTML, [{ suggestion: s, display: '<p><img src="data:image/png;base64,AAAA"></p>' }], 'B', 1))
    expect(out.querySelector('img')?.getAttribute('src')).toBe('data:image/png;base64,AAAA')
  })
})
