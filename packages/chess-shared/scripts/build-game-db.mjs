// Builds the game database of the books: every recognised game with its
// players, Elo, year, date, place, event, opening, result, how it ended and
// number of moves, plus a card for each book (cover, games, most frequent
// players, period of most games).
//
// Usage: node scripts/build-game-db.mjs <manifest.json> <out-dir>
//   manifest.json: [{ "file": "kasparov3.txt", "epub": "/path/book.epub", "id": "kasparov-3",
//                     "title": "…", "author": "…", "lang": "es" }, …]
//   "file" defaults to text/<id>.txt and "epub" to epub/<id>.epub, next to the manifest.
// Writes <out-dir>/games.sqlite, games.json (compact list for the browser),
// books.json, covers/<book id>.<ext>, games/<book id>.json (PGN of each game).
// Book contents are third-party works: publish only to a private repository.
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { extname, join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { recognizeGames, extractPlayers, treeToPgn, openingName, spanishToEnglish, parseGameHeader } from '../dist/index.js'
import { coverHref, gameEnding, headingLines, readGameHeading } from './gameDbExtract.mjs'

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
// Columns added after the migration: the file is rebuilt from scratch every time.
for (const col of ['place TEXT', 'date TEXT', 'white_elo INTEGER', 'black_elo INTEGER', 'termination TEXT']) db.exec(`ALTER TABLE db_games ADD COLUMN ${col}`)
const insBook = db.prepare('INSERT INTO db_books (id, title, author, lang, cover, games, period_from, period_to) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
const insGame = db.prepare('INSERT INTO db_games (id, book_id, white, black, year, event, opening, result, moves, pgn, place, date, white_elo, black_elo, termination) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')

/** The cover image of an EPUB: from its metadata (see coverHref), else the first image. */
function extractCover(epub, bookId) {
  if (!epub || !existsSync(epub)) return null
  const dir = mkdtempSync(join(tmpdir(), 'cover-'))
  try {
    execFileSync('unzip', ['-q', '-o', epub, '-d', dir])
    const container = readFileSync(join(dir, 'META-INF', 'container.xml'), 'utf8')
    const opfPath = /full-path="([^"]+)"/.exec(container)[1]
    const opf = readFileSync(join(dir, opfPath), 'utf8')
    const opfDir = join(dir, opfPath.replace(/[^/]*$/, ''))
    const item = coverHref(opf, (p) => { try { return readFileSync(join(opfDir, p), 'utf8') } catch { return null } })
    if (!item) return null
    const src = join(opfDir, item)
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
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

const YEAR = /\b(1[5-9]\d\d|20[0-2]\d)\b/
const books = []
const compact = []
for (const entry of manifest) {
  const text = readFileSync(join(base, entry.file ?? `text/${entry.id}.txt`), 'utf8')
  const epub = entry.epub ?? join(base, 'epub', `${entry.id}.epub`)
  const games = []
  let n = 0
  for (const chunk of text.split(/\f|\n(?=(?:Partida|Game|Partie)\s+\d+\s*\n)/)) {
    const body = entry.lang === 'es' ? spanishToEnglish(chunk) : chunk
    let found
    try { found = recognizeGames(body, { algorithm: 1 }) } catch { continue }
    let prevEnd = 0
    for (const g of found) {
      const main = g.tree.mainline.map((id) => g.tree.nodes.get(id))
      // The game's span may run over the prose (and the next heading) after its last move.
      const lastEnd = Math.max(...main.map((x) => x.charEnd ?? 0)) || g.charEnd
      if (main.length < 20) { prevEnd = lastEnd; continue }
      const first = main.find((x) => x.charStart !== undefined)?.charStart ?? g.charStart
      const head = body.slice(Math.max(prevEnd, first - 600), first)
      const lines = head.split('\n').map((l) => l.trim()).filter(Boolean)
      const heading = readGameHeading(headingLines(head), parseGameHeader)
      const players = heading?.white ? { white: heading.white, black: heading.black } : extractPlayers(head)
      const year = heading?.year ?? (Number(lines.map((l) => YEAR.exec(l)?.[1]).filter(Boolean).pop() ?? 0) || null)
      const tail = body.slice(lastEnd, lastEnd + 40)
      const written = /^\W{0,3}(1-0|0-1|½-½|1\/2-1\/2)/.exec(tail)?.[1] ?? /1-0|0-1|½-½|1\/2-1\/2|tablas/i.exec(body.slice(g.charEnd, g.charEnd + 40))?.[0]
      const sans = main.map((x) => x.san)
      let { result, termination } = gameEnding(body.slice(lastEnd, lastEnd + 300), sans[sans.length - 1], written?.replace('1/2-1/2', '½-½').replace(/tablas/i, '½-½') ?? '*')
      // A mate on the board: the side that moved last won.
      if (result === '*' && sans[sans.length - 1]?.endsWith('#')) result = sans.length % 2 ? '1-0' : '0-1'
      const opening = openingName(sans, 'en') ?? ''
      const id = `${entry.id}-${++n}`
      const pgn = treeToPgn(g.tree)
      const moves = Math.ceil(sans.length / 2)
      const extra = { place: heading?.place ?? null, event: heading?.event ?? null, date: heading?.date ?? null, whiteElo: heading?.whiteElo ?? null, blackElo: heading?.blackElo ?? null, termination }
      prevEnd = lastEnd
      games.push({ id, white: players.white, black: players.black, year, opening, result, moves, first: sans[0], ...extra, pgn })
      insGame.run(id, entry.id, players.white, players.black, year, extra.event, opening, result, moves, pgn, extra.place, extra.date, extra.whiteElo, extra.blackElo, termination)
      // New fields go at the end: readers of the older list keep working.
      compact.push([id, entry.id, players.white, players.black, year, opening, result, moves, sans[0], extra.place, extra.event, extra.date, extra.whiteElo, extra.blackElo, termination])
    }
  }
  writeFileSync(join(outDir, 'games', `${entry.id}.json`), JSON.stringify(games))
  const counts = new Map()
  // The same player is "T. Petrosian" in one heading and "Petrosian" in another: count by surname.
  for (const g of games) for (const p of [g.white, g.black]) if (p) { const k = p.split(' ').pop(); counts.set(k, (counts.get(k) ?? 0) + 1) }
  const top = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([name, games]) => ({ name, games }))
  const years = games.map((g) => g.year).filter(Boolean).sort((a, b) => a - b)
  const q = (p) => years.length ? years[Math.min(years.length - 1, Math.floor(p * years.length))] : null
  const cover = extractCover(epub, entry.id)
  const book = { id: entry.id, title: entry.title, author: entry.author ?? null, lang: entry.lang, cover: cover?.file ?? null, thumb: cover?.thumb ?? null, games: games.length, topPlayers: top, period: years.length ? [q(0.1), q(0.9)] : null }
  books.push(book)
  insBook.run(book.id, book.title, book.author, book.lang, book.cover, games.length, book.period?.[0] ?? null, book.period?.[1] ?? null)
  console.log(`${entry.title}: ${games.length} games${book.period ? `, ${book.period[0]}–${book.period[1]}` : ''}`)
}
writeFileSync(join(outDir, 'books.json'), JSON.stringify(books, null, 1))
writeFileSync(join(outDir, 'games.json'), JSON.stringify({ fields: ['id', 'book', 'white', 'black', 'year', 'opening', 'result', 'moves', 'first', 'place', 'event', 'date', 'whiteElo', 'blackElo', 'termination'], games: compact }))
db.close()
console.log(`${compact.length} games in ${books.length} books`)
