// Lichess studies module: existing studies, preview, add. Fakes only (no network, temp dirs, temp databases).
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createApp } from '../../lib/http.mjs'
import lichessModule, { createService, parseRef } from './index.mjs'

const { DatabaseSync } = createRequire(import.meta.url)('node:sqlite')
const MIGRATION = readFileSync(new URL('../../../../../../apps/api/migrations/005_position_comments.sql', import.meta.url), 'utf8')

const pgnOf = (study, chapter, name, { annotated = true } = {}) => `[Event "Invented ${name}: ${chapter}"]
[Site "https://lichess.org/study/${study}/${chapter}"]
[White "?"]
[Black "?"]
[UTCDate "2024.03.0${chapter.endsWith('1') ? 1 : 5}"]
[Annotator "https://lichess.org/@/inventedcoach"]
[StudyName "Invented ${name}"]
[ChapterName "${chapter}"]
[ChapterURL "https://lichess.org/study/${study}/${chapter}"]

1. e4 { [%clk 1:30:00] } e5 2. Nf3 Nc6 3. Bb5 ${annotated ? '{ The Spanish: the bishop presses on the knight that defends e5. }' : ''} a6
4. Ba4 Nf6 5. O-O Be7 6. Re1 b5 7. Bb3 d6 8. c3 O-O 9. h3 ${annotated ? '{ A useful waiting move that prevents Bg4 for good. }' : ''}
9... Nb8 ${annotated ? "{ Breyer's idea: the knight goes to d7 to free the c-pawn. }" : ''} 10. d4 Nbd7
11. Nbd2 Bb7 12. Bc2 Re8 13. Nf1 Bf8 *
`
const STUDY = (id, name = 'Study') => [pgnOf(id, 'chap0001', name), pgnOf(id, 'chap0002', name), pgnOf(id, 'chap0003', name, { annotated: false })].join('\n\n')

/** A fake fetch: routes by URL, records every call. */
function fakeFetch(routes) {
  const calls = []
  const impl = async (url, init = {}) => {
    calls.push({ url: String(url), headers: init.headers ?? {} })
    const r = routes(String(url), calls.length)
    const res = typeof r === 'string' ? { status: 200, body: r } : r
    return { status: res.status, text: async () => res.body ?? '', headers: { get: (k) => res.headers?.[k.toLowerCase()] ?? null } }
  }
  return { impl, calls }
}

let dir
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'lichess-mod-')) })
afterEach(() => rmSync(dir, { recursive: true, force: true }))

function makeDb(path, rows = true) {
  const db = new DatabaseSync(path)
  db.exec(MIGRATION)
  db.exec('ALTER TABLE position_comments ADD COLUMN move_number INTEGER; ALTER TABLE position_comments ADD COLUMN chapter INTEGER; ALTER TABLE position_comments ADD COLUMN hidden_at TEXT')
  if (rows) {
    db.exec(`INSERT INTO comment_sources VALUES (1,'book','A book','Author','en',1), (2,'lichess','Lichess study: Existing','coachA','en',2)`)
    db.prepare('INSERT INTO comment_games VALUES (?,?,?,?,?,?)').run('2-1', 2, null, null, 'Ch1', pgnOf('exisTing', 'chap0001', 'Existing'))
    db.prepare('INSERT INTO comment_games VALUES (?,?,?,?,?,?)').run('2-2', 2, null, null, 'Ch2', pgnOf('exisTing', 'chap0002', 'Existing'))
    const ins = db.prepare("INSERT INTO position_comments (id,hash,position,game_id,ply,san,lang,text) VALUES (?,?,?,?,?,?,?,?)")
    ins.run(1, 'h1', 'p1', '2-1', 5, 'Bb5', 'en', 'one'); ins.run(2, 'h2', 'p2', '2-1', 6, 'a6', 'en', 'two'); ins.run(3, 'h3', 'p3', '2-2', 5, 'Bb5', 'en', 'three'); ins.run(4, 'h4', 'p4', '2-1', 7, 'Ba4', 'en', 'four')
    ins.run(5, 'hb', 'pb', '2-1', 1, 'e4', 'en', 'a book-like row on a lichess game')
    const tr = db.prepare('INSERT INTO comment_translations VALUES (?,?,?)')
    tr.run(1, 'en', 'one normalized'); tr.run(2, 'en', ''); tr.run(1, 'es', 'uno'); tr.run(3, 'en', 'three normalized')
  }
  db.close()
  return path
}

describe('parseRef', () => {
  it('reads study urls, bare ids, users and a harvest list file', () => {
    expect(parseRef('https://lichess.org/study/abcdEFGH/xyz12345')).toMatchObject({ studies: [{ id: 'abcdEFGH' }], users: [] })
    expect(parseRef('abcdEFGH').studies[0].id).toBe('abcdEFGH')
    expect(parseRef('@someuser').users[0].id).toBe('someuser')
    expect(parseRef('https://lichess.org/@/some-user').users[0].id).toBe('some-user')
    expect(parseRef('some_user').users[0].id).toBe('some_user')
    const list = parseRef({ studies: ['abcdEFGH', { id: 'ijklMNOP', lang: 'es' }], users: ['bob'], minComments: 2 })
    expect(list.studies.map((s) => s.id)).toEqual(['abcdEFGH', 'ijklMNOP'])
    expect(list.studies[1].lang).toBe('es')
    expect(list.config.minComments).toBe(2)
    expect(parseRef(JSON.stringify({ studies: ['abcdEFGH'] })).studies).toHaveLength(1)
  })
  it('rejects garbage with a 400', () => {
    expect(() => parseRef('https://example.com/x y')).toThrow(expect.objectContaining({ status: 400 }))
    expect(() => parseRef('')).toThrow(expect.objectContaining({ status: 400 }))
  })
})

describe('existing studies', () => {
  it('summarizes each study from the database', () => {
    const dbPath = makeDb(join(dir, 'c.sqlite'))
    const svc = createService({ settings: () => ({ dbPath }), home: dir })
    const out = svc.listStudies()
    expect(out.configured).toBe(true)
    expect(out.studies).toHaveLength(1)
    const s = out.studies[0]
    expect(s).toMatchObject({ studyId: 'exisTing', name: 'Invented Existing', url: 'https://lichess.org/study/exisTing', games: 2, comments: 5, author: 'inventedcoach', normalized: 2, dropped: 1, translated: 1 })
    expect(s.avgComments).toBeCloseTo(2.5)
    expect(s.langs).toEqual(['en'])
    expect(s.firstDate).toBe('2024.03.01')
    expect(s.lastDate).toBe('2024.03.05')
    expect(out.totals).toMatchObject({ studies: 1, games: 2, comments: 5 })
  })
  it('says not configured without a database', () => {
    expect(createService({ settings: () => ({}), home: dir }).listStudies()).toEqual({ configured: false, studies: [], totals: { studies: 0, games: 0, comments: 0 } })
  })
})

describe('preview', () => {
  const baseDeps = (f, extra = {}) => ({ settings: () => ({ dbPath: '' }), home: dir, fetchImpl: f.impl, sleep: async () => {}, delayMs: 0, env: {}, ...extra })

  it('counts chapters and filtered comments, marks studies already in the db, sends no database write', async () => {
    const dbPath = makeDb(join(dir, 'c.sqlite'))
    const f = fakeFetch((url) => (url.includes('/study/exisTing.pgn') ? { status: 200, body: STUDY('exisTing'), headers: { 'last-modified': 'Wed, 20 Mar 2024 10:00:00 GMT' } } : STUDY('newStdy1', 'Fresh')))
    const svc = createService(baseDeps(f, { settings: () => ({ dbPath }) }))
    const before = readFileSync(dbPath)
    const out = await svc.preview({ ref: 'exisTing newStdy1' })
    expect(out.studies).toHaveLength(2)
    const [a, b] = out.studies
    expect(a).toMatchObject({ id: 'exisTing', chapters: 3, annotated: 2, keptGames: 2, comments: 6, inDb: true, owner: 'inventedcoach' })
    expect(a.updated).toBe('2024-03-20T10:00:00.000Z')
    expect(b).toMatchObject({ id: 'newStdy1', name: 'Invented Fresh', inDb: false })
    expect(readFileSync(dbPath).equals(before)).toBe(true)
    expect(f.calls).toHaveLength(2)
  })

  it('expands a username through the ndjson list, one request at a time', async () => {
    const f = fakeFetch((url) => {
      if (url.includes('/api/study/by/bob')) return JSON.stringify({ id: 'stuDYone', name: 'One', updatedAt: 1710000000000 }) + '\n' + JSON.stringify({ id: 'stuDYtwo', name: 'Two', updatedAt: 1720000000000 }) + '\n'
      return STUDY(url.includes('stuDYone') ? 'stuDYone' : 'stuDYtwo')
    })
    const slept = []
    const svc = createService(baseDeps(f, { sleep: async (ms) => slept.push(ms), delayMs: 1500 }))
    const out = await svc.preview({ ref: '@bob' })
    expect(out.studies.map((s) => s.id)).toEqual(['stuDYone', 'stuDYtwo'])
    expect(out.studies[0].owner).toBe('bob')
    expect(out.studies[0].updated).toBe(new Date(1710000000000).toISOString())
    expect(f.calls[0].url).toContain('/api/study/by/bob')
    expect(slept.filter((m) => m === 1500).length).toBe(2)
  })

  it('honours Retry-After on 429', async () => {
    let n = 0
    const f = fakeFetch(() => (++n === 1 ? { status: 429, headers: { 'retry-after': '7' } } : STUDY('abcdEFGH')))
    const slept = []
    const svc = createService(baseDeps(f, { sleep: async (ms) => slept.push(ms) }))
    const out = await svc.preview({ ref: 'abcdEFGH' })
    expect(slept).toContain(7000)
    expect(out.studies[0].chapters).toBe(3)
  })

  it('reports a private or missing study per study instead of failing everything', async () => {
    const f = fakeFetch((url) => (url.includes('missngXX') ? { status: 404 } : STUDY('abcdEFGH')))
    const out = await createService(baseDeps(f)).preview({ ref: 'missngXX abcdEFGH' })
    expect(out.studies[0]).toMatchObject({ id: 'missngXX' })
    expect(out.studies[0].error).toMatch(/404|not found/i)
    expect(out.studies[1].chapters).toBe(3)
  })

  it('sends the token only to lichess.org and never returns it', async () => {
    const f = fakeFetch(() => STUDY('abcdEFGH'))
    const out = await createService(baseDeps(f)).preview({ ref: 'abcdEFGH', token: 'lip_secret123' })
    expect(f.calls[0].headers.Authorization).toBe('Bearer lip_secret123')
    expect(JSON.stringify(out)).not.toContain('lip_secret123')
    const f2 = fakeFetch(() => STUDY('abcdEFGH'))
    await createService(baseDeps(f2, { env: { LICHESS_TOKEN: 'lip_env' } })).preview({ ref: 'abcdEFGH' })
    expect(f2.calls[0].headers.Authorization).toBe('Bearer lip_env')
    const f3 = fakeFetch(() => STUDY('abcdEFGH'))
    await createService(baseDeps(f3)).preview({ ref: 'abcdEFGH' })
    expect(f3.calls[0].headers.Authorization).toBeUndefined()
  })
})

describe('add', () => {
  /** A spawner that stands in for build-comment-db.mjs: writes a staging database for the harvested manifest. */
  function fakeSpawn(log) {
    return async (cmd, args, opts) => {
      log.push({ cmd, args, cwd: opts?.cwd })
      const [script, manifestPath, outDir] = args
      expect(script).toMatch(/build-comment-db\.mjs$/)
      const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
      mkdirSync(outDir, { recursive: true })
      const db = makeDb(join(outDir, 'comments.sqlite'), false)
      const conn = new DatabaseSync(join(outDir, 'comments.sqlite'))
      let gid = 0
      manifest.forEach((m, i) => {
        conn.prepare('INSERT INTO comment_sources VALUES (?,?,?,?,?,?)').run(i + 1, 'lichess', m.title, m.author, m.lang, 2)
        const pgns = readFileSync(join(manifestPath, '..', m.file), 'utf8').split(/\n\n(?=\[Event )/)
        pgns.forEach((pgn, k) => {
          conn.prepare('INSERT INTO comment_games VALUES (?,?,?,?,?,?)').run(`${i + 1}-${k + 1}`, i + 1, null, null, `c${k}`, pgn)
          conn.prepare('INSERT INTO position_comments (hash,position,game_id,ply,san,lang,text,move_number) VALUES (?,?,?,?,?,?,?,?)').run(`h${++gid}`, 'p', `${i + 1}-${k + 1}`, 5, 'Bb5', m.lang, 'The Spanish: the bishop presses on the knight.', 3)
        })
      })
      conn.close()
      return { code: 0, stdout: 'built 1 source\n', stderr: '' }
    }
  }
  const setup = (extra = {}) => {
    const dbPath = makeDb(join(dir, 'c.sqlite'))
    const spawnLog = []
    const f = fakeFetch((url) => STUDY(/study\/(\w{8})\.pgn/.exec(url)?.[1] ?? 'unknown1'))
    const svc = createService({ settings: () => ({ dbPath }), home: dir, fetchImpl: f.impl, sleep: async () => {}, delayMs: 0, env: {}, spawn: fakeSpawn(spawnLog), ps: async () => '  1 node something\n', ...extra })
    return { dbPath, spawnLog, f, svc }
  }

  it('harvests, builds a staging db with the supported script and merges it into the live db', async () => {
    const { dbPath, spawnLog, svc } = setup()
    const out = await svc.add({ studies: [{ id: 'newStdy1' }], token: 'lip_x' })
    expect(spawnLog).toHaveLength(1)
    expect(spawnLog[0].args[0]).toMatch(/scripts\/build-comment-db\.mjs$/)
    expect(out.added[0]).toMatchObject({ games: 2, comments: 2 })
    expect(JSON.stringify(out)).not.toContain('lip_x')
    const db = new DatabaseSync(dbPath, { readOnly: true })
    expect(db.prepare("SELECT COUNT(*) n FROM comment_sources WHERE kind='lichess'").get().n).toBe(2)
    expect(db.prepare('SELECT COUNT(*) n FROM comment_games').get().n).toBe(4)
    expect(db.prepare("SELECT COUNT(*) n FROM position_comments").get().n).toBe(7)
    expect(db.prepare("SELECT COUNT(*) n FROM comment_translations").get().n).toBe(4)
    expect(db.prepare("SELECT id FROM comment_games WHERE id LIKE '3-%'").all()).toHaveLength(2)
    db.close()
    const list = JSON.parse(readFileSync(join(dir, 'lichess-sources.json'), 'utf8'))
    expect(list.studies.map((s) => (typeof s === 'string' ? s : s.id))).toContain('newStdy1')
    expect(svc.listStudies().studies.map((s) => s.studyId).sort()).toEqual(['exisTing', 'newStdy1'])
  })

  it('does not add a chapter twice and keeps the database untouched when nothing is new', async () => {
    const { dbPath, svc } = setup()
    await svc.add({ studies: [{ id: 'newStdy1' }] })
    const out = await svc.add({ studies: [{ id: 'newStdy1' }] })
    expect(out.added).toEqual([])
    expect(out.skipped.length).toBeGreaterThan(0)
    const db = new DatabaseSync(dbPath, { readOnly: true })
    expect(db.prepare('SELECT COUNT(*) n FROM comment_games').get().n).toBe(4)
    db.close()
  })

  it('refuses while a translate-comments process is running, without fetching or writing', async () => {
    const { dbPath, f, spawnLog, svc } = setup({ ps: async () => '123 node scripts/translate-comments.mjs db.sqlite --model x\n' })
    const before = readFileSync(dbPath)
    await expect(svc.add({ studies: [{ id: 'newStdy1' }] })).rejects.toMatchObject({ status: 409 })
    expect(f.calls).toHaveLength(0)
    expect(spawnLog).toHaveLength(0)
    expect(readFileSync(dbPath).equals(before)).toBe(true)
  })

  it('leaves the db and the sources list alone when the build script fails', async () => {
    const { dbPath, svc } = setup({ spawn: async () => ({ code: 1, stdout: '', stderr: 'boom: dist missing' }) })
    const before = readFileSync(dbPath)
    await expect(svc.add({ studies: [{ id: 'newStdy1' }] })).rejects.toThrow(/boom/)
    expect(readFileSync(dbPath).equals(before)).toBe(true)
    expect(existsSync(join(dir, 'lichess-sources.json'))).toBe(false)
  })

  it('validates the request', async () => {
    const { svc } = setup()
    await expect(svc.add({ studies: [] })).rejects.toMatchObject({ status: 400 })
    await expect(svc.add({ studies: [{ id: 'bad id!' }] })).rejects.toMatchObject({ status: 400 })
  })
})

describe('routes', () => {
  it('registers the four routes and serves the studies list', async () => {
    const dbPath = makeDb(join(dir, 'c.sqlite'))
    const app = createApp()
    lichessModule.routes(app, { home: dir, settings: () => ({ dbPath }), app })
    expect(app.routes.map(([m, p]) => `${m} ${p}`).sort()).toEqual(['GET /api/lichess/job', 'GET /api/lichess/studies', 'POST /api/lichess/add', 'POST /api/lichess/preview'])
    const handler = app.routes.find(([m, p]) => m === 'GET' && p === '/api/lichess/studies')[2]
    expect((await handler({})).studies).toHaveLength(1)
  })
})
