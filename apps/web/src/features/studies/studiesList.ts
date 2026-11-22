import type { Study } from './studiesApi'

export type SortKey = 'name' | 'author' | 'rating' | 'likes' | 'updated' | 'imported'
export type SortDir = 'asc' | 'desc'

const value = (s: Study, k: SortKey): string | number | null => {
  switch (k) {
    case 'name': return s.name.toLowerCase()
    case 'author': return s.author ? s.author.toLowerCase() : null
    case 'rating': return s.myRating
    case 'likes': return s.lichessLikes
    case 'updated': return s.updatedAt
    case 'imported': return s.importedAt
  }
}

/** Sort by a column; empty values go last in either direction. */
export function sortStudies<T extends Study>(list: T[], key: SortKey, dir: SortDir): T[] {
  const sign = dir === 'asc' ? 1 : -1
  return [...list].sort((a, b) => {
    const x = value(a, key), y = value(b, key)
    if (x === null && y === null) return a.name.localeCompare(b.name)
    if (x === null) return 1
    if (y === null) return -1
    return x < y ? -sign : x > y ? sign : a.name.localeCompare(b.name)
  })
}

/** Text filter (name or author) plus an optional exact author. */
export function filterStudies(list: Study[], text: string, author: string): Study[] {
  const t = text.trim().toLowerCase()
  return list.filter((s) =>
    (!author || s.author === author) &&
    (!t || s.name.toLowerCase().includes(t) || (s.author ?? '').toLowerCase().includes(t)))
}

/** Clicking the active column flips the direction; another column starts ascending. */
export function nextSort(cur: { key: SortKey; dir: SortDir }, key: SortKey): { key: SortKey; dir: SortDir } {
  return cur.key === key ? { key, dir: cur.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'asc' }
}

export interface StudyRow { study: Study; parts: Study[] }

/**
 * One row per group (root = the study whose id is the groupId, or the first part
 * present) with its parts in partOrder; ungrouped studies are single rows.
 */
export function groupRows(list: Study[]): StudyRow[] {
  const groups = new Map<string, Study[]>()
  const rows: StudyRow[] = []
  for (const s of list) {
    if (!s.groupId) { rows.push({ study: s, parts: [] }); continue }
    const g = groups.get(s.groupId) ?? []
    g.push(s)
    groups.set(s.groupId, g)
  }
  for (const [id, members] of groups) {
    const ordered = [...members].sort((a, b) => (a.partOrder ?? 1e9) - (b.partOrder ?? 1e9))
    const root = ordered.find((m) => m.id === id) ?? ordered[0]
    rows.push({ study: root, parts: ordered })
  }
  return rows
}

/** Rows keep the order of their first member in the sorted list. */
export function sortedRows(list: Study[], key: SortKey, dir: SortDir): StudyRow[] {
  const sorted = sortStudies(list, key, dir)
  const rows = groupRows(sorted)
  const pos = new Map(sorted.map((s, i) => [s.id, i]))
  const at = (r: StudyRow) => Math.min(...(r.parts.length ? r.parts : [r.study]).map((p) => pos.get(p.id) ?? 0))
  return rows.sort((a, b) => at(a) - at(b))
}
