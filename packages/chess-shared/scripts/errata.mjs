// Errata of a resources repository (errata/index.json + errata/<book-slug>/<chapter>-<gameIndex>.json,
// format in chessreader-resources docs/FORMAT.md) applied to the text of a book chapter, the way the
// reader applies them (apps/web/src/features/library/errata/errataApply.ts): each corrected move
// replaces the printed one in the game's main line; comments and variations stay as written.
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import * as lib from '../dist/index.js'

export { lib }
const { recognizeGames, tokenize, spanishToEnglish, figurineToAscii } = lib

/** Fixed transliteration table, identical to the app's (errataFormat.ts) and the server's (BookSlug.php). */
const TRANSLIT = {
  á: 'a', à: 'a', â: 'a', ä: 'a', ã: 'a', å: 'a',
  é: 'e', è: 'e', ê: 'e', ë: 'e',
  í: 'i', ì: 'i', î: 'i', ï: 'i',
  ó: 'o', ò: 'o', ô: 'o', ö: 'o', õ: 'o', ø: 'o',
  ú: 'u', ù: 'u', û: 'u', ü: 'u',
  ñ: 'n', ç: 'c', ý: 'y', ÿ: 'y',
  ß: 'ss', æ: 'ae', œ: 'oe',
}

/** The errata folder of a book: [a-z0-9-], at most 80 characters. */
export function bookSlug(title) {
  const lower = [...title.toLowerCase()].map((c) => TRANSLIT[c] ?? c).join('')
  return lower.replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80).replace(/-+$/, '')
}

/** Every entry listed in <dir>/index.json, by book slug. An absent folder or index gives none. */
export function loadErrata(dir) {
  const byBook = new Map()
  const indexPath = join(dir, 'index.json')
  if (!existsSync(indexPath)) return byBook
  const index = JSON.parse(readFileSync(indexPath, 'utf8'))
  for (const item of index.entries ?? []) {
    const file = join(dir, item.path)
    if (!existsSync(file)) continue
    const entry = JSON.parse(readFileSync(file, 'utf8'))
    const list = byBook.get(item.book) ?? byBook.set(item.book, []).get(item.book)
    list.push(entry)
  }
  return byBook
}

/** The entries of one chapter of a book, found by the slug of its title or by its id. */
export function errataFor(byBook, book, chapter) {
  const keys = new Set([bookSlug(book.title ?? ''), book.id].filter(Boolean))
  return [...keys].flatMap((k) => byBook.get(k) ?? []).filter((e) => e.chapter === chapter)
}

const core = (m) => m.trim().replace(/[!?]+$/g, '').replace(/\s+/g, '')

/** A printed move in English letters, as the recogniser reads it. */
const toEnglish = (move, lang) => core(lang === 'es' ? spanishToEnglish(figurineToAscii(move)) : figurineToAscii(move))

/**
 * The main-line moves of a recognised game as written: the moves the
 * recogniser kept, then the top-level moves after them (a wrong move stops
 * the recognised main line, but the printed game goes on), with their spans.
 * Same reading as initialMoves in apps/web correction/workbench.ts.
 */
function writtenMainLine(text, game) {
  const starts = new Set()
  let lastMainEnd = game.charStart
  for (const id of game.tree.mainline) {
    const n = game.tree.nodes.get(id)
    if (n.charStart === undefined || n.charEnd === undefined) continue
    starts.add(n.charStart)
    lastMainEnd = Math.max(lastMainEnd, n.charEnd)
  }
  const out = []
  let depth = 0
  const base = game.charStart
  for (const t of tokenize(figurineToAscii(text.slice(base, game.charEnd)))) {
    if (t.type === 'variation-open') depth++
    else if (t.type === 'variation-close') depth = Math.max(0, depth - 1)
    if (t.type !== 'move' || !t.san) continue
    const charStart = base + t.charStart
    const charEnd = base + t.charEnd
    if (starts.has(charStart) || (depth === 0 && !t.isolated && charStart >= lastMainEnd)) {
      out.push({ charStart, charEnd, written: text.slice(charStart, charEnd) })
    }
  }
  return out
}

/** The game an entry is about: its index first, else the one whose first moves are the printed ones. */
function findGame(text, games, entry, lang) {
  const printed = entry.original.moves.map((m) => toEnglish(m, lang))
  const sample = Math.min(8, printed.length)
  const order = [entry.gameIndex, ...games.map((_, i) => i).filter((i) => i !== entry.gameIndex)]
  for (const i of order) {
    const game = games[i]
    if (!game) continue
    const moves = writtenMainLine(text, game)
    let same = 0
    for (let k = 0; k < sample; k++) if (moves[k] && core(moves[k].written) === printed[k]) same++
    if (sample > 0 && same >= Math.ceil(sample * 0.75)) return moves
  }
  return null
}

/**
 * A chapter text (English letters: Spanish books already passed through
 * spanishToEnglish) with the corrections of its errata written in: each
 * printed move named by a change, with its evaluation marks, becomes the
 * corrected English SAN. `lang` is the book's language, to read the printed
 * moves of the entries.
 */
export function applyErrata(text, entries, { lang = 'en' } = {}) {
  if (!entries.length) return { text, applied: 0 }
  const games = recognizeGames(text, { algorithm: 2 })
  const edits = []
  for (const entry of entries) {
    const moves = findGame(text, games, entry, lang)
    if (!moves) continue
    for (const change of entry.changes ?? []) {
      const move = moves[change.ply - 1]
      if (!move || core(move.written) !== toEnglish(change.from, lang)) continue
      let end = move.charEnd
      while (end < text.length && /[!?]/.test(text[end])) end++
      edits.push({ start: move.charStart, end, to: change.to })
    }
  }
  // From the end backwards: the offsets before each edit stay valid.
  edits.sort((a, b) => b.start - a.start)
  let out = text
  let applied = 0
  let limit = Infinity
  for (const e of edits) {
    if (e.end > limit) continue // overlapping changes: the first one wins
    out = out.slice(0, e.start) + e.to + out.slice(e.end)
    limit = e.start
    applied++
  }
  return { text: out, applied }
}
