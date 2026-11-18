/**
 * Errata: the corrected main line of a book game whose printed text has a
 * wrong move. The same JSON is stored by the server
 * (storage/errata/<book-slug>/<chapter>-<gameIndex>.json) and in the
 * resources repository (errata/, listed in errata/index.json). The format is
 * documented in chessreader-resources docs/FORMAT.md; the server validates it
 * with the same rules as validateErrata.
 */

export type ErrataSource = 'online' | 'engine' | 'manual'
export const ERRATA_SOURCES: readonly ErrataSource[] = ['online', 'engine', 'manual']

export interface ErrataChange {
  /** 1-based ply of the main line. */
  ply: number
  /** The move as printed in the book (with its !? marks). */
  from: string
  /** The correct move, English SAN. */
  to: string
  source: ErrataSource
  /** Where the correction comes from: a game URL, an engine line, a note. */
  evidence?: string
}

export interface ErrataEntry {
  id: string
  book: { title: string; id?: number | string }
  chapter: number
  gameIndex: number
  game: { label: string; white?: string | null; black?: string | null; number?: number | string | null }
  /** The main line as printed (SAN in the book's notation) and an excerpt of the text. */
  original: { moves: string[]; text: string }
  /** The corrected main line, English SAN. */
  corrected: { moves: string[] }
  changes: ErrataChange[]
  createdAt: string
  appVersion: string
}

/** Fixed transliteration table, identical to the server's (App\Application\Errata\BookSlug). */
const TRANSLIT: Record<string, string> = {
  á: 'a', à: 'a', â: 'a', ä: 'a', ã: 'a', å: 'a',
  é: 'e', è: 'e', ê: 'e', ë: 'e',
  í: 'i', ì: 'i', î: 'i', ï: 'i',
  ó: 'o', ò: 'o', ô: 'o', ö: 'o', õ: 'o', ø: 'o',
  ú: 'u', ù: 'u', û: 'u', ü: 'u',
  ñ: 'n', ç: 'c', ý: 'y', ÿ: 'y',
  ß: 'ss', æ: 'ae', œ: 'oe',
}

/** The folder name of a book: [a-z0-9-], at most 80 characters (never a dot or a slash). */
export function bookSlug(title: string): string {
  const lower = [...title.toLowerCase()].map((c) => TRANSLIT[c] ?? c).join('')
  return lower.replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80).replace(/-+$/, '')
}

/** Where the entry lives under errata/: <book-slug>/<chapter>-<gameIndex>.json. */
export function errataPath(entry: Pick<ErrataEntry, 'book' | 'chapter' | 'gameIndex'>): string {
  return `${bookSlug(entry.book.title)}/${entry.chapter}-${entry.gameIndex}.json`
}

const isText = (v: unknown, max: number) => typeof v === 'string' && v.trim() !== '' && v.length <= max
const isIndex = (v: unknown) => Number.isInteger(v) && (v as number) >= 0 && (v as number) <= 100000
const isMoves = (v: unknown) => Array.isArray(v) && v.length <= 1000 && v.every((m) => typeof m === 'string' && m.length <= 24)
const obj = (v: unknown): Record<string, unknown> | null => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null)

/** The problems of an entry (same messages as the server); empty when it is valid. */
export function validateErrata(value: unknown): string[] {
  const e = obj(value)
  if (!e) return ['the entry must be an object']
  const errors: string[] = []
  if (!isText(e.id, 120) || !/^[A-Za-z0-9._-]+$/.test(e.id as string)) {
    errors.push('id must be 1-120 characters of letters, digits, dot, dash or underscore')
  }
  const book = obj(e.book)
  if (!book || !isText(book.title, 300)) errors.push('book.title is required')
  else if (bookSlug(book.title as string) === '') errors.push('book.title must contain letters or digits')
  if (!isIndex(e.chapter)) errors.push('chapter must be an integer >= 0')
  if (!isIndex(e.gameIndex)) errors.push('gameIndex must be an integer >= 0')
  const game = obj(e.game)
  if (!game || !isText(game.label, 300)) errors.push('game.label is required')
  const original = obj(e.original)
  if (!original || !isMoves(original.moves)) errors.push('original.moves must be a list of moves')
  if (!original || typeof original.text !== 'string' || original.text.length > 5000) {
    errors.push('original.text must be a string of at most 5000 characters')
  }
  const corrected = obj(e.corrected)
  if (!corrected || !isMoves(corrected.moves)) errors.push('corrected.moves must be a list of moves')
  if (!Array.isArray(e.changes) || e.changes.length === 0 || e.changes.length > 1000) {
    errors.push('changes must be a non-empty list')
  } else {
    e.changes.forEach((raw, i) => {
      const c = obj(raw)
      if (!c) { errors.push(`changes[${i}] must be an object`); return }
      if (!Number.isInteger(c.ply) || (c.ply as number) < 1) errors.push(`changes[${i}].ply must be an integer >= 1`)
      for (const k of ['from', 'to'] as const) {
        if (typeof c[k] !== 'string' || (c[k] as string).length > 24) errors.push(`changes[${i}].${k} must be a move`)
      }
      if (!ERRATA_SOURCES.includes(c.source as ErrataSource)) errors.push(`changes[${i}].source must be one of ${ERRATA_SOURCES.join(', ')}`)
      if (c.evidence !== undefined && !isText(c.evidence, 1000)) errors.push(`changes[${i}].evidence must be a string`)
    })
  }
  if (!isText(e.createdAt, 40) || Number.isNaN(Date.parse(e.createdAt as string))) errors.push('createdAt must be an ISO 8601 date')
  if (!isText(e.appVersion, 40)) errors.push('appVersion is required')
  return errors
}

/** A move without its evaluation marks ("Bb4!?" → "Bb4"). */
export const coreMove = (san: string) => san.trim().replace(/[!?]+$/g, '')

export interface BuildErrataInput {
  book: ErrataEntry['book']
  chapter: number
  gameIndex: number
  game: ErrataEntry['game']
  /** The main line as printed: what is written, and its English SAN. */
  original: { written: string; san: string }[]
  /** The corrected main line (same length), with where each changed move comes from. */
  corrected: { san: string; origin?: ErrataSource; evidence?: string }[]
  text: string
  now?: Date
  appVersion?: string
}

/** An entry from the printed and the corrected main line: one change per substituted move. */
export function buildErrataEntry(input: BuildErrataInput): ErrataEntry {
  const changes: ErrataChange[] = []
  input.corrected.forEach((m, i) => {
    const o = input.original[i]
    if (!o || coreMove(m.san) === coreMove(o.san)) return
    changes.push({
      ply: i + 1, from: o.written, to: coreMove(m.san), source: m.origin ?? 'manual',
      ...(m.evidence ? { evidence: m.evidence } : {}),
    })
  })
  const slug = bookSlug(input.book.title)
  return {
    id: `${slug}-${input.chapter}-${input.gameIndex}`,
    book: input.book,
    chapter: input.chapter,
    gameIndex: input.gameIndex,
    game: input.game,
    original: { moves: input.original.map((m) => m.written), text: input.text.slice(0, 5000) },
    corrected: { moves: input.corrected.map((m) => coreMove(m.san)) },
    changes,
    createdAt: (input.now ?? new Date()).toISOString(),
    appVersion: input.appVersion ?? 'unknown',
  }
}
