// Library books: the EPUBs uploaded to the app, how many comments the commentary database has for each, a dry-run
// preview of what the game recogniser finds, and adding a book's comments to the commentary database.
//
// Comments are filed by language: `comment_sources.lang` is the book's language and every comment of that source
// carries it (the Status tab counts per language). The new comments are normalized/translated later by the queue.
// "Add" builds ONLY the chosen book into a staging folder with scripts/build-comment-db.mjs (through an injectable
// spawner) and copies the new source, games and comments into the live database in one short transaction, the same
// way the Lichess module does. Insert-only, except an explicit replace of the book's own source.
import { execFile } from 'node:child_process'
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import { openDb, withDb } from '../../lib/db.mjs'

const SCRIPTS = join(dirname(fileURLToPath(import.meta.url)), '../../..')
const REPO = join(SCRIPTS, '../../..')
const run = promisify(execFile)
const httpError = (status, message) => Object.assign(new Error(message), { status })
const LANGS = ['es', 'en', 'de', 'fr', 'it', 'pt']

// ---- text ----
const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', ndash: '–', mdash: '—', hellip: '…', lsquo: '‘', rsquo: '’', ldquo: '“', rdquo: '”', times: '×', middot: '·', eacute: 'é', aacute: 'á', iacute: 'í', oacute: 'ó', uacute: 'ú', ntilde: 'ñ', uuml: 'ü', ouml: 'ö', auml: 'ä' }
const decode = (s) => s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => {
  if (e[0] === '#') { const c = e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10); try { return String.fromCodePoint(c) } catch { return m } }
  return ENTITIES[e.toLowerCase()] ?? m
})

/** HTML of a chapter to plain text: block tags and <br> become newlines, entities are decoded, head/style/script/title dropped. */
export function htmlToText(html) {
  return decode(String(html ?? '')
    .replace(/<(head|title|style|script)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/?(p|div|h[1-6]|li|ul|ol|tr|table|blockquote|section|article|pre|hr)\b[^>]*>/gi, '\n')
    .replace(/<[^>]+>/g, ''))
    .replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim()
}

const norm = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()

/** The book source whose title is the book's title or starts it as whole words (accent/case/punctuation-insensitive); the longest wins; never Lichess. */
export function matchSource(title, sources) {
  const t = norm(title)
  let best = null, bestLen = -1
  for (const s of sources) {
    if (s.kind === 'lichess') continue
    const n = norm(s.title)
    if (!n) continue
    if ((t === n || t.startsWith(`${n} `)) && n.length > bestLen) { best = s; bestLen = n.length }
  }
  return best
}

const defaultSpawn = async (cmd, args, opts = {}) => {
  try {
    const { stdout, stderr } = await run(cmd, args, { cwd: opts.cwd, maxBuffer: 64 * 1024 * 1024, timeout: 30 * 60_000 })
    return { code: 0, stdout, stderr }
  } catch (e) {
    return { code: typeof e.code === 'number' ? e.code : 1, stdout: e.stdout ?? '', stderr: e.stderr || e.message }
  }
}
const defaultPs = async () => (await run('ps', ['-axo', 'pid,command'], { maxBuffer: 8 * 1024 * 1024 })).stdout
const defaultLoadRecognizer = () => import('../../../../dist/index.js')
const isTranslateRunning = (psText) => /scripts\/translate-comments\.mjs/.test(psText)
const tail = (s, n = 1500) => String(s ?? '').trim().slice(-n)
const cleanLang = (v) => { const l = String(v ?? '').trim().toLowerCase().slice(0, 2); return /^[a-z]{2}$/.test(l) ? l : '' }

export function createService({ settings, home, spawn = defaultSpawn, ps = defaultPs, loadRecognizer = defaultLoadRecognizer, scriptsDir = SCRIPTS, repoRoot = REPO } = {}) {
  const state = { job: { running: false, step: '', log: [], result: null, error: null } }
  const libraryPath = () => settings().libraryDb || join(repoRoot, 'apps/api/storage/chess.sqlite')

  const bookSources = (db) => db.all("SELECT id, kind, title, author, lang FROM comment_sources WHERE kind != 'lichess' ORDER BY id")
  const countComments = (db, sourceId) => db.get('SELECT COUNT(*) AS n FROM position_comments c JOIN comment_games g ON g.id=c.game_id WHERE g.source_id=?', sourceId).n

  function readBook(id) {
    const lib = libraryPath()
    if (!existsSync(lib)) throw httpError(400, `library database not found: ${lib}`)
    return withDb(lib, (db) => {
      const book = db.get('SELECT id, title, author, language FROM books WHERE id=?', Number(id))
      if (!book) throw httpError(404, 'book not found')
      const chapters = db.all('SELECT ord, html FROM chapters WHERE book_id=? ORDER BY ord, id', book.id)
      return { ...book, language: cleanLang(book.language), chapters }
    })
  }
  const textChapters = (book) => book.chapters.map((c) => htmlToText(c.html)).filter((t) => t)
  const chooseLang = (book, lang) => {
    if (lang !== undefined && lang !== null && lang !== '') {
      if (!LANGS.includes(String(lang).toLowerCase()) && cleanLang(lang) !== book.language) throw httpError(400, `invalid language: ${String(lang).slice(0, 10)}`)
      return String(lang).toLowerCase().slice(0, 2)
    }
    return book.language
  }

  function listBooks() {
    const { dbPath } = settings()
    const lib = libraryPath()
    if (!dbPath) return { configured: false, libraryConfigured: false, libraryDb: lib, books: [] }
    if (!existsSync(lib)) return { configured: true, libraryConfigured: false, libraryDb: lib, books: [] }
    const { books, requests } = withDb(lib, (db) => {
      const books = db.all('SELECT b.id, b.title, b.author, b.language, (SELECT COUNT(*) FROM chapters c WHERE c.book_id=b.id) AS chapters FROM books b ORDER BY b.id')
      const requests = new Map()
      try { // the table is missing in older databases: no requests then
        for (const r of db.all('SELECT id, book_id, status, note, created_at FROM book_comment_requests ORDER BY id')) requests.set(r.book_id, { id: r.id, status: r.status, note: r.note ?? '', createdAt: r.created_at })
      } catch { /* no table */ }
      return { books, requests }
    })
    const { sources, counts } = existsSync(dbPath)
      ? withDb(dbPath, (db) => { const s = bookSources(db); return { sources: s, counts: new Map(s.map((x) => [x.id, countComments(db, x.id)])) } })
      : { sources: [], counts: new Map() }
    return {
      configured: true, libraryConfigured: true, libraryDb: lib,
      books: books.map((b) => {
        const src = matchSource(b.title, sources)
        return { id: b.id, title: b.title, author: b.author ?? '', language: cleanLang(b.language), chapters: b.chapters, source: src ? { id: src.id, title: src.title, lang: src.lang } : null, comments: src ? counts.get(src.id) : 0, request: requests.get(b.id) ?? null }
      }),
    }
  }

  /** Dry run: the same recognition as build-comment-db.mjs for a book entry, no database write. */
  async function preview({ bookId, lang } = {}) {
    const { dbPath } = settings()
    const book = readBook(bookId)
    const chosen = chooseLang(book, lang)
    let rec
    try { rec = await loadRecognizer() } catch (e) { throw httpError(500, `the recogniser is not built (${e.message}): run pnpm build in packages/chess-shared`) }
    const { recognizeGames, extractPositionComments, spanishToEnglish } = rec
    const chapters = textChapters(book)
    let games = 0, withComments = 0, comments = 0
    const perChapter = [], sample = []
    chapters.forEach((raw, i) => {
      const chapter = i + 1
      let found = 0
      const body0 = chosen === 'es' && spanishToEnglish ? spanishToEnglish(raw) : raw
      for (const body of body0.split(/\n(?=(?:Partida|Game|Partie)\s+\d+\s*\n)/)) {
        let list
        try { list = recognizeGames(body, { algorithm: 2 }) } catch { continue }
        for (const game of list) {
          if (game.tree.mainline.length < 10) continue
          games++
          const cs = extractPositionComments(body, game, { lang: chosen })
          if (!cs.length) continue
          withComments++
          found += cs.length
          for (const c of cs) if (sample.length < 5) sample.push({ chapter, ply: c.ply, san: c.san, text: String(c.text).slice(0, 300) })
        }
      }
      comments += found
      if (found) perChapter.push({ chapter, comments: found })
    })
    const existing = dbPath && existsSync(dbPath)
      ? withDb(dbPath, (db) => { const s = matchSource(book.title, bookSources(db)); return s ? { id: s.id, title: s.title, lang: s.lang, comments: countComments(db, s.id) } : null })
      : null
    return { bookId: book.id, title: book.title, author: book.author, lang: chosen, needsLang: !chosen, chapters: chapters.length, games, gamesWithComments: withComments, comments, perChapter, sample, existing }
  }

  const log = (m) => { state.job.log.push(m); if (state.job.log.length > 200) state.job.log.shift() }

  /** Inserts the staged source into the live database in ONE transaction; optionally replaces the book's current source. */
  function merge(livePath, stagingPath, { title, replace }) {
    const staging = openDb(stagingPath, { readOnly: true })
    const live = openDb(livePath, { readOnly: false })
    try {
      const cols = (db, table) => db.all(`PRAGMA table_info(${table})`).map((c) => c.name)
      const shared = (table) => cols(staging, table).filter((c) => c !== 'id' && cols(live, table).includes(c))
      const sourceCols = shared('comment_sources'), gameCols = shared('comment_games').filter((c) => c !== 'source_id'), commentCols = shared('position_comments').filter((c) => c !== 'game_id')
      const src = staging.get('SELECT * FROM comment_sources ORDER BY id LIMIT 1')
      const games = staging.all('SELECT * FROM comment_games WHERE source_id=? ORDER BY id', src.id)
      live.exec('BEGIN IMMEDIATE')
      try {
        const old = matchSource(title, bookSources(live))
        let replaced = null
        if (old) {
          const comments = countComments(live, old.id)
          if (!replace) { live.exec('ROLLBACK'); return { skipped: { reason: 'source-exists', sourceId: old.id, title: old.title, lang: old.lang, comments } } }
          const games0 = live.get('SELECT COUNT(*) AS n FROM comment_games WHERE source_id=?', old.id).n
          const tr = live.get('SELECT COUNT(*) AS n FROM comment_translations WHERE comment_id IN (SELECT c.id FROM position_comments c JOIN comment_games g ON g.id=c.game_id WHERE g.source_id=?)', old.id).n
          live.run('DELETE FROM comment_translations WHERE comment_id IN (SELECT c.id FROM position_comments c JOIN comment_games g ON g.id=c.game_id WHERE g.source_id=?)', old.id)
          live.run('DELETE FROM position_comments WHERE game_id IN (SELECT id FROM comment_games WHERE source_id=?)', old.id)
          live.run('DELETE FROM comment_games WHERE source_id=?', old.id)
          live.run('DELETE FROM comment_sources WHERE id=?', old.id)
          replaced = { sourceId: old.id, games: games0, comments, translations: tr }
        }
        const sid = live.get('SELECT COALESCE(MAX(id), 0) + 1 AS n FROM comment_sources').n
        live.run(`INSERT INTO comment_sources (id, ${sourceCols.join(', ')}) VALUES (?${', ?'.repeat(sourceCols.length)})`, sid, ...sourceCols.map((c) => src[c]))
        let comments = 0
        games.forEach((g, i) => {
          const gid = `${sid}-${i + 1}`
          live.run(`INSERT INTO comment_games (id, source_id, ${gameCols.join(', ')}) VALUES (?, ?${', ?'.repeat(gameCols.length)})`, gid, sid, ...gameCols.map((c) => g[c]))
          for (const c of staging.all('SELECT * FROM position_comments WHERE game_id=? ORDER BY id', g.id)) {
            live.run(`INSERT INTO position_comments (game_id, ${commentCols.join(', ')}) VALUES (?${', ?'.repeat(commentCols.length)})`, gid, ...commentCols.map((k) => c[k]))
            comments++
          }
        })
        live.exec('COMMIT')
        return { added: { sourceId: sid, title: src.title, author: src.author, lang: src.lang, games: games.length, comments }, ...(replaced ? { replaced } : {}) }
      } catch (e) { try { live.exec('ROLLBACK') } catch { /* already rolled back */ } throw e }
    } finally { staging.close(); live.close() }
  }

  async function add({ bookId, confirm, lang, replace = false } = {}) {
    if (confirm !== true) throw httpError(400, 'confirm the addition first')
    const { dbPath } = settings()
    if (!dbPath) throw httpError(400, 'no database set: choose one in the settings')
    if (state.job.running) throw httpError(409, 'a books job is already running')
    const book = readBook(bookId)
    const chosen = chooseLang(book, lang)
    if (!chosen) throw httpError(400, 'the library has no language for this book: choose a language (es, en, de, fr, it or pt) first')
    const chapters = textChapters(book)
    if (!chapters.length) throw httpError(422, 'the book has no text')
    if (replace !== true) {
      const old = existsSync(dbPath) ? withDb(dbPath, (db) => { const s = matchSource(book.title, bookSources(db)); return s ? { sourceId: s.id, title: s.title, lang: s.lang, comments: countComments(db, s.id) } : null }) : null
      if (old) return { skipped: { reason: 'source-exists', ...old } }
    }
    if (isTranslateRunning(await ps())) throw httpError(409, 'a translate-comments.mjs process is running: wait for it to finish (only one process may write the database)')
    state.job = { running: true, step: 'export', log: [], result: null, error: null, startedAt: new Date().toISOString() }
    const work = join(home, 'books-work', `${Date.now()}-${book.id}`)
    try {
      mkdirSync(work, { recursive: true })
      writeFileSync(join(work, 'book.txt'), chapters.join('\f'))
      const manifest = join(work, 'manifest.json')
      writeFileSync(manifest, JSON.stringify([{ file: 'book.txt', title: book.title, author: book.author, lang: chosen, kind: 'book' }]))
      state.job.step = 'build'
      const staging = join(work, 'db')
      log('build-comment-db (staging folder, the live database is not touched)')
      const res = await spawn(process.execPath, [join(scriptsDir, 'build-comment-db.mjs'), manifest, staging], { cwd: join(scriptsDir, '..') })
      log(tail(res.stdout))
      if (res.code !== 0) throw httpError(500, `build-comment-db.mjs failed (exit ${res.code}): ${tail(res.stderr)}`)
      const stagingDb = join(staging, 'comments.sqlite')
      const found = existsSync(stagingDb) ? withDb(stagingDb, (db) => db.get('SELECT COUNT(*) AS n FROM position_comments').n) : 0
      if (!found) throw httpError(422, 'no comments were recognised in this book, nothing to add')
      state.job.step = 'merge'
      if (isTranslateRunning(await ps())) throw httpError(409, 'a translate-comments.mjs process started meanwhile; nothing was written')
      const out = merge(dbPath, stagingDb, { title: book.title, replace: replace === true })
      const result = { ...out, ...(out.added ? { note: `Filed under language "${chosen}". The Status tab counters include them now; normalization and translation of the new comments happen in the Queue tab.` } : {}) }
      state.job = { ...state.job, running: false, step: 'done', result }
      return result
    } catch (e) {
      state.job = { ...state.job, running: false, step: 'failed', error: e.message }
      throw e
    } finally { rmSync(work, { recursive: true, force: true }) }
  }

  return { listBooks, preview, add, job: () => state.job }
}

export default {
  routes(app, ctx) {
    const svc = createService({ settings: () => ctx.settings(), home: ctx.home })
    app.get('/api/books/list', () => svc.listBooks())
    app.get('/api/books/job', () => svc.job())
    app.post('/api/books/preview', async (c) => svc.preview(await c.body()))
    app.post('/api/books/add', async (c) => svc.add(await c.body()))
  },
}
