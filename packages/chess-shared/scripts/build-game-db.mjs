// Builds the game database of the books: every recognised game with its
// players, year, event, opening, result and number of moves, plus a card for
// each book (cover, games, most frequent players, period of most games).
//
// Usage: node scripts/build-game-db.mjs <manifest.json> <out-dir>
//   manifest.json: [{ "file": "kasparov3.txt", "epub": "/path/book.epub", "id": "kasparov-3",
//                     "title": "…", "author": "…", "lang": "es" }, …]
// Writes <out-dir>/games.sqlite, games.json (compact list for the browser),
// books.json, covers/<book id>.<ext>, games/<book id>.json (PGN of each game).
// Book contents are third-party works: publish only to a private repository.
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { extname, join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { recognizeGames, extractPlayers, treeToPgn, openingName, spanishToEnglish } from '../dist/index.js'

const [manifestPath, outDir] = process.argv.slice(2)
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
const base = manifestPath.replace(/[^/]*$/, '')
for (const d of ['covers', 'games']) mkdirSync(join(outDir, d), { recursive: true })
const dbFile = join(outDir, 'games.sqlite')
if (existsSync(dbFile)) execFileSync('rm', [dbFile])
const db = new DatabaseSync(dbFile)
// Games are written before their book's card (it needs the games): keys are checked by the data, not here.
db.exec('PRAGMA foreign_keys = OFF')
db.exec(readFileSync(new URL('../../../apps/api/migrations/006_games_db.sql', import.meta.url), 'utf8'))
const insBook = db.prepare('INSERT INTO db_books (id, title, author, lang, cover, games, period_from, period_to) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
const insGame = db.prepare('INSERT INTO db_games (id, book_id, white, black, year, event, opening, result, moves, pgn) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')

/** The cover image of an EPUB (the manifest item marked as cover, or the first image). */
function extractCover(epub, bookId) {
  if (!epub || !existsSync(epub)) return null
  const dir = mkdtempSync(join(tmpdir(), 'cover-'))
  try {
    execFileSync('unzip', ['-q', '-o', epub, '-d', dir])
    const container = readFileSync(join(dir, 'META-INF', 'container.xml'), 'utf8')
    const opfPath = /full-path="([^"]+)"/.exec(container)[1]
    const opf = readFileSync(join(dir, opfPath), 'utf8')
    const coverId = /<meta[^>]*name="cover"[^>]*content="([^"]+)"/.exec(opf)?.[1]
    const item = (coverId && new RegExp(`<item[^>]*id="${coverId}"[^>]*href="([^"]+)"`).exec(opf)?.[1])
      ?? /<item[^>]*href="([^"]+\.(?:jpe?g|png))"[^>]*properties="cover-image"/.exec(opf)?.[1]
      ?? /<item[^>]*href="([^"]+\.(?:jpe?g|png))"/.exec(opf)?.[1]
    if (!item) return null
    const src = join(dir, opfPath.replace(/[^/]*$/, ''), decodeURIComponent(item))
    const name = `${bookId}${extname(src).toLowerCase()}`
    writeFileSync(join(outDir, 'covers', name), readFileSync(src))
    // A small copy for the cards (macOS `sips`; elsewhere the full image path only).
    try {
      const small = join(outDir, 'covers', `${bookId}-small.jpg`)
      execFileSync('sips', ['-s', 'format', 'jpeg', '-Z', '320', src, '--out', small], { stdio: 'ignore' })
      return { file: `covers/${name}`, thumb: `data:image/jpeg;base64,${readFileSync(small).toString('base64')}` }
    } catch {
      return { file: `covers/${name}`, thumb: null }
    }
  } catch {
    return null
  }
}

const YEAR = /\b(1[5-9]\d\d|20[0-2]\d)\b/
const NAME = "[A-ZÁÉÍÓÚÑÄÖÜ][A-Za-zÁÉÍÓÚÑÄÖÜáéíóúñäöüß.'’ ]{1,38}"
const PAIR = new RegExp(`^(${NAME}?)\\s*[-–—]\\s*(${NAME})$`)
/** "Petrosian" for "T. PETROSIAN", "T. Petrosian": the way books name players, as one person. */
const tidy = (n) => n.trim().replace(/\s+/g, ' ').split(' ').map((w) => (w.length > 2 && w === w.toUpperCase() ? w[0] + w.slice(1).toLowerCase() : w)).join(' ')
/** A heading line "T. Petrosian-S. Gligoric" / "Alekhine – Capablanca" just before the game. */
function headingPlayers(lines) {
  for (const l of [...lines].reverse().slice(0, 6)) {
    if (/\d/.test(l) || l.length > 70) continue
    const m = PAIR.exec(l)
    if (m && m[1].trim().length > 2 && m[2].trim().length > 2) return { white: tidy(m[1]), black: tidy(m[2]) }
  }
  return null
}
const books = []
const compact = []
for (const entry of manifest) {
  const text = readFileSync(join(base, entry.file), 'utf8')
  const games = []
  let n = 0
  for (const chunk of text.split(/\f|\n(?=(?:Partida|Game|Partie)\s+\d+\s*\n)/)) {
    const body = entry.lang === 'es' ? spanishToEnglish(chunk) : chunk
    let found
    try { found = recognizeGames(body, { algorithm: 1 }) } catch { continue }
    let prevEnd = 0
    for (const g of found) {
      const main = g.tree.mainline.map((id) => g.tree.nodes.get(id))
      if (main.length < 20) { prevEnd = g.charEnd; continue }
      const first = main.find((x) => x.charStart !== undefined)?.charStart ?? g.charStart
      const head = body.slice(Math.max(prevEnd, first - 600), first)
      const lines = head.split('\n').map((l) => l.trim()).filter(Boolean)
      const players = headingPlayers(lines) ?? extractPlayers(head)
      const year = Number(lines.map((l) => YEAR.exec(l)?.[1]).filter(Boolean).pop() ?? 0) || null
      const event = lines.filter((l) => YEAR.test(l) && l.length < 80).pop() ?? null
      const tail = body.slice(g.charEnd, g.charEnd + 40)
      const result = /1-0|0-1|½-½|1\/2-1\/2|tablas/i.exec(tail)?.[0]?.replace('1/2-1/2', '½-½').replace(/tablas/i, '½-½') ?? '*'
      const sans = main.map((x) => x.san)
      const opening = openingName(sans, 'en') ?? ''
      const id = `${entry.id}-${++n}`
      const pgn = treeToPgn(g.tree)
      prevEnd = g.charEnd
      games.push({ id, white: players.white, black: players.black, year, event, opening, result, moves: Math.ceil(sans.length / 2), first: sans[0], pgn })
      insGame.run(id, entry.id, players.white, players.black, year, event, opening, result, Math.ceil(sans.length / 2), pgn)
      compact.push([id, entry.id, players.white, players.black, year, opening, result, Math.ceil(sans.length / 2), sans[0]])
    }
  }
  writeFileSync(join(outDir, 'games', `${entry.id}.json`), JSON.stringify(games))
  const counts = new Map()
  // The same player is "T. Petrosian" in one heading and "Petrosian" in another: count by surname.
  for (const g of games) for (const p of [g.white, g.black]) if (p) { const k = p.split(' ').pop(); counts.set(k, (counts.get(k) ?? 0) + 1) }
  const top = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([name, games]) => ({ name, games }))
  const years = games.map((g) => g.year).filter(Boolean).sort((a, b) => a - b)
  const q = (p) => years.length ? years[Math.min(years.length - 1, Math.floor(p * years.length))] : null
  const cover = extractCover(entry.epub, entry.id)
  const book = { id: entry.id, title: entry.title, author: entry.author ?? null, lang: entry.lang, cover: cover?.file ?? null, thumb: cover?.thumb ?? null, games: games.length, topPlayers: top, period: years.length ? [q(0.1), q(0.9)] : null }
  books.push(book)
  insBook.run(book.id, book.title, book.author, book.lang, book.cover, games.length, book.period?.[0] ?? null, book.period?.[1] ?? null)
  console.log(`${entry.title}: ${games.length} games${book.period ? `, ${book.period[0]}–${book.period[1]}` : ''}`)
}
writeFileSync(join(outDir, 'books.json'), JSON.stringify(books, null, 1))
writeFileSync(join(outDir, 'games.json'), JSON.stringify({ fields: ['id', 'book', 'white', 'black', 'year', 'opening', 'result', 'moves', 'first'], games: compact }))
db.close()
console.log(`${compact.length} games in ${books.length} books`)
