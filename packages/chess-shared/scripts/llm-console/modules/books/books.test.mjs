// Library books module: list, preview (dry run) and add. Temp databases and a fake spawner only.
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createService, htmlToText, matchSource } from './index.mjs'

const { DatabaseSync } = createRequire(import.meta.url)('node:sqlite')
const API = new URL('../../../../../../apps/api/migrations/', import.meta.url)
const COMMENTS_MIGRATION = readFileSync(new URL('005_position_comments.sql', API), 'utf8')
const BOOKS_MIGRATION = readFileSync(new URL('002_create_books.sql', API), 'utf8')

// Invented text: a short game with a comment between moves.
const GAME = '1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 4. Ba4 Nf6 5. O-O Be7 6. Re1 b5 7. Bb3 d6 8. c3 O-O 9. h3 Nb8 10. d4 Nbd7 11. Nbd2 Bb7'
const CH1 = `<html><head><title>x</title><style>p{}</style></head><body><h1>Chapter &amp; one</h1><p>Invented game, White &ndash; Black.</p><p>1. e4 e5 2. Nf3 Nc6 3. Bb5 a6</p><p>The bishop pins the knight, which is an invented remark about the plan.</p><p>4. Ba4 Nf6 5. O-O Be7 6. Re1 b5 7. Bb3 d6 8. c3 O-O 9. h3 Nb8 10. d4 Nbd7 11. Nbd2 Bb7</p></body></html>`
const CH2 = '<p>Second chapter only prose, without any game at all.</p><br>Line two'
const CH_EMPTY = '<html><head><title>only a title</title></head><body></body></html>'

let dir
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'books-mod-')) })
afterEach(() => rmSync(dir, { recursive: true, force: true }))

const REQUESTS_TABLE = "CREATE TABLE book_comment_requests (id INTEGER PRIMARY KEY AUTOINCREMENT, book_id INTEGER NOT NULL, status TEXT NOT NULL DEFAULT 'pending', note TEXT NOT NULL DEFAULT '', requested_by INTEGER, created_at TEXT NOT NULL, updated_at TEXT NOT NULL)"

function makeLibrary(path = join(dir, 'lib.sqlite'), { requests = false } = {}) {
  const db = new DatabaseSync(path)
  db.exec('CREATE TABLE users (id INTEGER PRIMARY KEY)')
  db.exec(BOOKS_MIGRATION)
  db.exec("ALTER TABLE books ADD COLUMN language TEXT NOT NULL DEFAULT ''")
  db.exec("INSERT INTO users VALUES (1)")
  const ins = db.prepare("INSERT INTO books (id, owner_id, title, author, language, created_at) VALUES (?,1,?,?,?,'2024-01-01')")
  ins.run(1, 'Invented Openings: Part 2', 'A. Writer', 'en')
  ins.run(2, 'Libro sin idioma', 'B. Autor', '')
  ins.run(3, 'Unrelated Book', '', 'de')
  const ch = db.prepare('INSERT INTO chapters (book_id, ord, title, html) VALUES (?,?,?,?)')
  ch.run(1, 1, 'One', CH1); ch.run(1, 2, 'Two', CH2); ch.run(1, 3, 'Empty', CH_EMPTY)
  ch.run(2, 1, 'Uno', CH1)
  ch.run(3, 1, 'Eins', CH1)
  if (requests) {
    db.exec(REQUESTS_TABLE)
    const r = db.prepare('INSERT INTO book_comment_requests (book_id, status, note, requested_by, created_at, updated_at) VALUES (?,?,?,1,?,?)')
    r.run(1, 'pending', 'old note', '2024-01-01', '2024-01-01') // book 1 already has comments: fulfilled
    r.run(2, 'rejected', 'first', '2024-02-01', '2024-02-01')
    r.run(2, 'pending', 'please add it', '2024-03-01', '2024-03-02') // latest of book 2
  }
  db.close()
  return path
}

function makeComments(path = join(dir, 'comments.sqlite'), { rows = true } = {}) {
  const db = new DatabaseSync(path)
  db.exec(COMMENTS_MIGRATION)
  db.exec('ALTER TABLE position_comments ADD COLUMN move_number INTEGER; ALTER TABLE position_comments ADD COLUMN chapter INTEGER; ALTER TABLE position_comments ADD COLUMN hidden_at TEXT; ALTER TABLE comment_sources ADD COLUMN book_id TEXT')
  if (rows) {
    db.exec(`INSERT INTO comment_sources (id,kind,title,author,lang,priority) VALUES
      (1,'book','Invented Openings','A. Writer','en',1), (2,'book','Invented Openings: Part 2 Extra','A. Writer','en',1), (3,'lichess','Invented Openings: Part 2','coach','en',2)`)
    db.prepare('INSERT INTO comment_games VALUES (?,?,?,?,?,?)').run('1-1', 1, null, null, 'G', GAME)
    const ins = db.prepare('INSERT INTO position_comments (id,hash,position,game_id,ply,san,lang,text) VALUES (?,?,?,?,?,?,?,?)')
    ins.run(1, 'h1', 'p1', '1-1', 5, 'Bb5', 'en', 'old one'); ins.run(2, 'h2', 'p2', '1-1', 6, 'a6', 'en', 'old two')
    db.prepare('INSERT INTO comment_translations VALUES (?,?,?)').run(1, 'es', 'viejo uno')
  }
  db.close()
  return path
}

const rows = (path, sql, ...p) => { const db = new DatabaseSync(path, { readOnly: true }); try { return db.prepare(sql).all(...p) } finally { db.close() } }

/** Stands in for build-comment-db.mjs: reads the manifest and writes a staging database with one source, one game, two comments. */
function fakeSpawn(log, { code = 0, empty = false } = {}) {
  return async (cmd, args) => {
    log.push({ cmd, args })
    if (code) return { code, stdout: '', stderr: 'boom: dist missing' }
    const manifest = JSON.parse(readFileSync(args[1], 'utf8'))
    log.at(-1).manifest = manifest
    log.at(-1).text = readFileSync(join(args[1], '..', manifest[0].file), 'utf8')
    const out = args[2]
    mkdirSync(out, { recursive: true })
    const db = new DatabaseSync(join(out, 'comments.sqlite'))
    db.exec(COMMENTS_MIGRATION)
    db.exec('ALTER TABLE position_comments ADD COLUMN move_number INTEGER; ALTER TABLE position_comments ADD COLUMN chapter INTEGER; ALTER TABLE position_comments ADD COLUMN hidden_at TEXT; ALTER TABLE comment_sources ADD COLUMN book_id TEXT')
    const m = manifest[0]
    db.prepare('INSERT INTO comment_sources (id,kind,title,author,lang,priority) VALUES (1,?,?,?,?,1)').run(m.kind, m.title, m.author ?? null, m.lang)
    if (!empty) {
      db.prepare('INSERT INTO comment_games VALUES (?,?,?,?,?,?)').run('1-1', 1, null, null, 'G', GAME)
      const ins = db.prepare('INSERT INTO position_comments (hash,position,game_id,ply,san,lang,text,chapter,move_number) VALUES (?,?,?,?,?,?,?,?,?)')
      ins.run('n1', 'q1', '1-1', 5, 'Bb5', m.lang, 'new one', 1, 3); ins.run('n2', 'q2', '1-1', 6, 'a6', m.lang, 'new two', 1, 3)
    }
    db.close()
    return { code: 0, stdout: 'ok', stderr: '' }
  }
}

let seq = 0
const setup = (extra = {}, opts = {}) => {
  seq++
  const libraryDb = makeLibrary(join(dir, `lib${seq}.sqlite`), opts)
  const dbPath = makeComments(join(dir, `comments${seq}.sqlite`), opts)
  const spawnLog = []
  const svc = createService({ settings: () => ({ dbPath, libraryDb }), home: dir, spawn: fakeSpawn(spawnLog), ps: async () => '  1 node something\n', ...extra })
  return { libraryDb, dbPath, spawnLog, svc }
}

describe('htmlToText', () => {
  it('turns blocks and br into newlines, decodes entities and drops head/style/script', () => {
    const t = htmlToText('<html><head><title>T</title></head><body><style>a{}</style><script>x()</script><h1>A &amp; B</h1><p>one&nbsp;two &#233; &#x41;</p>l1<br/>l2<div>end</div></body></html>')
    expect(t).not.toMatch(/^T/)
    expect(t).toContain('A & B')
    expect(t).toContain('one two é A')
    expect(t).toContain('l1\nl2')
    expect(t).not.toContain('x()')
    expect(t).not.toContain('a{}')
    expect(t.split('\n').map((l) => l.trim()).filter(Boolean)).toEqual(['A & B', 'one two é A', 'l1', 'l2', 'end'])
  })
})

describe('matchSource', () => {
  const sources = [
    { id: 1, kind: 'book', title: 'Invented Openings' },
    { id: 2, kind: 'book', title: 'Invented Openings: Part 2 Extra' },
    { id: 3, kind: 'lichess', title: 'Invented Openings: Part 2' },
    { id: 4, kind: 'book', title: 'Invent' },
  ]
  it('matches whole-word prefixes ignoring case, accents and punctuation; longest wins; never Lichess', () => {
    expect(matchSource('Invented Openings: Part 2', sources).id).toBe(1)
    expect(matchSource('INVENTED  openings — part 2 extra', sources).id).toBe(2)
    expect(matchSource('Invented Openings', sources).id).toBe(1)
    expect(matchSource('Inventéd openings', sources).id).toBe(1)
    expect(matchSource('Unrelated', sources)).toBe(null)
  })
  it('does not match partial words', () => {
    expect(matchSource('Invented', sources)).toBe(null)
  })
})

describe('listBooks', () => {
  it('lists each book with language, chapters, existing source, comments and its language section', () => {
    const { svc } = setup()
    const out = svc.listBooks()
    expect(out).toMatchObject({ configured: true, libraryConfigured: true })
    expect(out.books).toHaveLength(3)
    const [b1, b2, b3] = out.books
    expect(b1).toMatchObject({ id: 1, title: 'Invented Openings: Part 2', author: 'A. Writer', language: 'en', chapters: 3, comments: 2, source: { id: 1, lang: 'en' } })
    expect(b2).toMatchObject({ id: 2, language: '', chapters: 1, comments: 0, source: null })
    expect(b3).toMatchObject({ id: 3, language: 'de', comments: 0, source: null })
  })
  it('defaults the library to apps/api/storage/chess.sqlite of the repository and reports a missing file', () => {
    const dbPath = makeComments(join(dir, 'c-a.sqlite'))
    const svc = createService({ settings: () => ({ dbPath }), home: dir })
    const out = svc.listBooks()
    expect(out.libraryDb).toMatch(/apps\/api\/storage\/chess\.sqlite$/)
    expect(typeof out.libraryConfigured).toBe('boolean')
  })
  it('says not configured without a commentary database', () => {
    expect(createService({ settings: () => ({}), home: dir }).listBooks().configured).toBe(false)
  })
  it('reports a library file that does not exist', () => {
    const dbPath = makeComments(join(dir, 'c-b.sqlite'))
    const svc = createService({ settings: () => ({ dbPath, libraryDb: join(dir, 'nope.sqlite') }), home: dir })
    expect(svc.listBooks()).toMatchObject({ libraryConfigured: false, books: [] })
  })
})

describe('listBooks requests', () => {
  it('has request null for every book when the table does not exist (older database)', () => {
    const { svc } = setup()
    expect(svc.listBooks().books.map((b) => b.request)).toEqual([null, null, null])
  })
  it('returns the latest request of each book, read-only', () => {
    const { svc, libraryDb } = setup({}, { requests: true })
    const before = readFileSync(libraryDb)
    const [b1, b2, b3] = svc.listBooks().books
    expect(b1.request).toEqual({ id: 1, status: 'pending', note: 'old note', createdAt: '2024-01-01' })
    expect(b2.request).toEqual({ id: 3, status: 'pending', note: 'please add it', createdAt: '2024-03-01' })
    expect(b3.request).toBe(null)
    expect(readFileSync(libraryDb).equals(before)).toBe(true)
  })
  it('does not write to the library database when adding', async () => {
    const { svc, libraryDb } = setup({}, { requests: true })
    const before = readFileSync(libraryDb)
    await svc.add({ bookId: 2, confirm: true, lang: 'es' })
    expect(readFileSync(libraryDb).equals(before)).toBe(true)
    expect(rows(libraryDb, 'SELECT status FROM book_comment_requests WHERE book_id=2 ORDER BY id').map((r) => r.status)).toEqual(['rejected', 'pending'])
  })
})

describe('preview', () => {
  it('exports chapters, runs the recogniser and reports counts without writing anything', async () => {
    const { svc, dbPath, libraryDb, spawnLog } = setup()
    const before = [readFileSync(dbPath), readFileSync(libraryDb)]
    const out = await svc.preview({ bookId: 1 })
    expect(out).toMatchObject({ bookId: 1, lang: 'en', needsLang: false, chapters: 2, existing: { id: 1, comments: 2 } })
    expect(out.games).toBe(1)
    expect(out.gamesWithComments).toBe(1)
    expect(out.comments).toBeGreaterThanOrEqual(1)
    expect(out.perChapter).toEqual([{ chapter: 1, comments: out.comments }])
    expect(out.sample.length).toBeLessThanOrEqual(5)
    expect(out.sample[0].text).toMatch(/invented remark/)
    expect(readFileSync(dbPath).equals(before[0])).toBe(true)
    expect(readFileSync(libraryDb).equals(before[1])).toBe(true)
    expect(spawnLog).toHaveLength(0)
  })
  it('asks for a language when the library has none', async () => {
    const { svc } = setup()
    expect(await svc.preview({ bookId: 2 })).toMatchObject({ lang: '', needsLang: true })
    expect(await svc.preview({ bookId: 2, lang: 'es' })).toMatchObject({ lang: 'es', needsLang: false })
  })
  it('rejects an unknown book and an invalid language', async () => {
    const { svc } = setup()
    await expect(svc.preview({ bookId: 99 })).rejects.toMatchObject({ status: 404 })
    await expect(svc.preview({ bookId: 2, lang: 'xx1' })).rejects.toMatchObject({ status: 400 })
  })
  it('reports a missing recogniser build', async () => {
    const { svc } = setup({ loadRecognizer: async () => { throw new Error('Cannot find module dist/index.js') } })
    await expect(svc.preview({ bookId: 1 })).rejects.toMatchObject({ status: 500, message: expect.stringContaining('pnpm build') })
  })
})

describe('add', () => {
  it('builds a staging database from a manifest and merges the new source, game and comments in the book language', async () => {
    const { svc, dbPath, spawnLog } = setup({}, { rows: false })
    const r = await svc.add({ bookId: 1, confirm: true })
    expect(spawnLog).toHaveLength(1)
    expect(spawnLog[0].args[0]).toMatch(/scripts\/build-comment-db\.mjs$/)
    expect(spawnLog[0].manifest).toEqual([{ file: expect.any(String), title: 'Invented Openings: Part 2', author: 'A. Writer', lang: 'en', kind: 'book' }])
    expect(spawnLog[0].text).toContain('\f')
    expect(spawnLog[0].text).toContain('Chapter & one')
    expect(r).toMatchObject({ added: { title: 'Invented Openings: Part 2', games: 1, comments: 2, lang: 'en' } })
    expect(rows(dbPath, 'SELECT id, kind, title, lang, priority FROM comment_sources')).toEqual([{ id: 1, kind: 'book', title: 'Invented Openings: Part 2', lang: 'en', priority: 1 }])
    expect(rows(dbPath, 'SELECT id, source_id FROM comment_games')).toEqual([{ id: '1-1', source_id: 1 }])
    const c = rows(dbPath, 'SELECT game_id, lang, text, chapter, move_number FROM position_comments ORDER BY id')
    expect(c).toEqual([{ game_id: '1-1', lang: 'en', text: 'new one', chapter: 1, move_number: 3 }, { game_id: '1-1', lang: 'en', text: 'new two', chapter: 1, move_number: 3 }])
    expect(r.note).toMatch(/Status|queue/i)
  })
  it('remaps ids after the existing rows and never touches them', async () => {
    const { svc, dbPath } = setup()
    // book 3 has no source: add it under its own (German) language
    const r = await svc.add({ bookId: 3, confirm: true, lang: 'de' })
    expect(r.added).toMatchObject({ sourceId: 4, lang: 'de' })
    expect(rows(dbPath, 'SELECT id FROM comment_games ORDER BY id').map((g) => g.id)).toEqual(['1-1', '4-1'])
    expect(rows(dbPath, "SELECT text FROM position_comments WHERE game_id='1-1' ORDER BY id").map((c) => c.text)).toEqual(['old one', 'old two'])
    expect(rows(dbPath, 'SELECT lang FROM comment_translations')).toEqual([{ lang: 'es' }])
    expect(rows(dbPath, "SELECT DISTINCT lang FROM position_comments WHERE game_id='4-1'")).toEqual([{ lang: 'de' }])
  })
  it('requires the confirmation and writes nothing without it', async () => {
    const { svc, dbPath, spawnLog } = setup()
    await expect(svc.add({ bookId: 3, lang: 'de' })).rejects.toMatchObject({ status: 400 })
    expect(spawnLog).toHaveLength(0)
    expect(rows(dbPath, 'SELECT COUNT(*) AS n FROM comment_sources')).toEqual([{ n: 3 }])
  })
  it('requires a language when the library has none, and accepts a chosen one', async () => {
    const { svc, spawnLog } = setup()
    await expect(svc.add({ bookId: 2, confirm: true })).rejects.toMatchObject({ status: 400, message: expect.stringMatching(/language/) })
    expect(spawnLog).toHaveLength(0)
    const r = await svc.add({ bookId: 2, confirm: true, lang: 'es' })
    expect(r.added.lang).toBe('es')
    expect(spawnLog[0].manifest[0].lang).toBe('es')
  })
  it('skips a book whose source already exists unless replace is asked', async () => {
    const { svc, dbPath, spawnLog } = setup()
    const r = await svc.add({ bookId: 1, confirm: true })
    expect(r).toMatchObject({ skipped: { reason: 'source-exists', sourceId: 1, comments: 2 } })
    expect(spawnLog).toHaveLength(0)
    expect(rows(dbPath, 'SELECT COUNT(*) AS n FROM position_comments')).toEqual([{ n: 2 }])
  })
  it('replace deletes the old source, games, comments and translations and inserts the new ones in one transaction', async () => {
    const { svc, dbPath } = setup()
    const r = await svc.add({ bookId: 1, confirm: true, replace: true })
    expect(r.replaced).toEqual({ sourceId: 1, games: 1, comments: 2, translations: 1 })
    expect(rows(dbPath, 'SELECT id, title FROM comment_sources ORDER BY id').map((s) => s.id)).toEqual([2, 3, 4])
    expect(rows(dbPath, 'SELECT text FROM position_comments ORDER BY id').map((c) => c.text)).toEqual(['new one', 'new two'])
    expect(rows(dbPath, 'SELECT COUNT(*) AS n FROM comment_translations')).toEqual([{ n: 0 }])
    expect(rows(dbPath, 'SELECT id FROM comment_games').map((g) => g.id)).toEqual(['4-1'])
  })
  it('refuses while translate-comments.mjs runs, before and after the build', async () => {
    const running = '123 node scripts/translate-comments.mjs db.sqlite --model x\n'
    const a = setup({ ps: async () => running })
    await expect(a.svc.add({ bookId: 3, confirm: true, lang: 'de' })).rejects.toMatchObject({ status: 409 })
    expect(a.spawnLog).toHaveLength(0)
    let calls = 0
    const b = setup({ ps: async () => (++calls > 1 ? running : 'idle\n') })
    await expect(b.svc.add({ bookId: 3, confirm: true, lang: 'de' })).rejects.toMatchObject({ status: 409 })
    expect(rows(b.dbPath, 'SELECT COUNT(*) AS n FROM comment_sources')).toEqual([{ n: 3 }])
  })
  it('reports a failed build and writes nothing', async () => {
    const { svc, dbPath } = setup({ spawn: async () => ({ code: 1, stdout: '', stderr: 'boom: dist missing' }) })
    await expect(svc.add({ bookId: 3, confirm: true, lang: 'de' })).rejects.toMatchObject({ status: 500, message: expect.stringContaining('boom') })
    expect(rows(dbPath, 'SELECT COUNT(*) AS n FROM comment_sources')).toEqual([{ n: 3 }])
  })
  it('adds nothing when the build finds no comments', async () => {
    const spawnLog = []
    const { svc, dbPath } = setup({ spawn: fakeSpawn(spawnLog, { empty: true }) })
    await expect(svc.add({ bookId: 3, confirm: true, lang: 'de' })).rejects.toMatchObject({ status: 422 })
    expect(rows(dbPath, 'SELECT COUNT(*) AS n FROM comment_sources')).toEqual([{ n: 3 }])
  })
  it('removes its work folder', async () => {
    const { svc } = setup()
    await svc.add({ bookId: 3, confirm: true, lang: 'de' })
    expect(() => readFileSync(join(dir, 'books-work'))).toThrow()
  })
})
