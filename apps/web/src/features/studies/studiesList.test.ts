import { describe, expect, it } from 'vitest'
import type { Study } from './studiesApi'
import { filterStudies, nextSort, sortedRows, sortStudies } from './studiesList'

const mk = (id: string, o: Partial<Study> = {}): Study => ({ id, name: id, author: null, chapters: 1, games: 1, comments: 0, linkedIds: [], groupId: null, partOrder: null, isBook: false, source: 'lichess', updatedAt: null, importedAt: null, myRating: null, lichessLikes: null, ...o })

describe('studies list helpers', () => {
  it('sorts by name ascending and descending', () => {
    const l = [mk('b'), mk('A'), mk('c')]
    expect(sortStudies(l, 'name', 'asc').map((s) => s.id)).toEqual(['A', 'b', 'c'])
    expect(sortStudies(l, 'name', 'desc').map((s) => s.id)).toEqual(['c', 'b', 'A'])
  })
  it('puts nulls last in either direction', () => {
    const l = [mk('a'), mk('b', { myRating: 2 }), mk('c', { myRating: 5 })]
    expect(sortStudies(l, 'rating', 'asc').map((s) => s.id)).toEqual(['b', 'c', 'a'])
    expect(sortStudies(l, 'rating', 'desc').map((s) => s.id)).toEqual(['c', 'b', 'a'])
  })
  it('filters by text and author', () => {
    const l = [mk('x', { name: 'Endgames', author: 'ann' }), mk('y', { name: 'Openings', author: 'bob' })]
    expect(filterStudies(l, 'end', '').map((s) => s.id)).toEqual(['x'])
    expect(filterStudies(l, '', 'bob').map((s) => s.id)).toEqual(['y'])
  })
  it('toggles direction on the same column', () => {
    expect(nextSort({ key: 'name', dir: 'asc' }, 'name')).toEqual({ key: 'name', dir: 'desc' })
    expect(nextSort({ key: 'name', dir: 'desc' }, 'author')).toEqual({ key: 'author', dir: 'asc' })
  })
  it('groups parts under their root in partOrder', () => {
    const l = [mk('p2', { groupId: 'r', partOrder: 2 }), mk('r', { groupId: 'r', partOrder: 1 }), mk('solo')]
    const rows = sortedRows(l, 'name', 'asc')
    expect(rows).toHaveLength(2)
    const g = rows.find((r) => r.parts.length)!
    expect(g.study.id).toBe('r')
    expect(g.parts.map((p) => p.id)).toEqual(['r', 'p2'])
  })
})
