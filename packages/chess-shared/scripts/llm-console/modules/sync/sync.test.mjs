// Tests of the publish module: fakes only (fake GitHub API, fake git/node spawner, temp dirs and databases).
import { describe, expect, it, afterEach } from 'vitest'
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, readdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createRequire } from 'node:module'
import { createSync, localStats, remoteStats, planSample, resolveToken, exportStatic, buildSampleDb } from './index.mjs'
import { loadSettings, saveSettings } from '../../lib/config.mjs'

const { DatabaseSync } = createRequire(import.meta.url)('node:sqlite')
const MIGRATIONS = new URL('../../../../../../apps/api/migrations/', import.meta.url)
const TOKEN = 'ghp_FAKE_TOKEN_for_tests_0123456789'
const dirs = []
const tmp = () => { const d = mkdtempSync(join(tmpdir(), 'sync-test-')); dirs.push(d); return d }
afterEach(() => { for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true }) })

/** A temp comments database with invented comments: 1 book, 1 lichess source. */
function makeDb(dir) {
  const path = join(dir, 'comments.sqlite')
  const db = new DatabaseSync(path)
  db.exec(readFileSync(new URL('005_position_comments.sql', MIGRATIONS), 'utf8'))
  db.exec('ALTER TABLE position_comments ADD COLUMN move_number INTEGER')
  db.exec('ALTER TABLE position_comments ADD COLUMN chapter INTEGER')
  db.exec('ALTER TABLE position_comments ADD COLUMN hidden_at TEXT')
  db.exec('ALTER TABLE comment_sources ADD COLUMN book_id TEXT')
  db.exec(readFileSync(new URL('008_comment_tombstones.sql', MIGRATIONS), 'utf8'))
  db.prepare("INSERT INTO comment_sources (id, kind, title, author, lang, priority, book_id) VALUES (1,'book','Invented Book','A. Author','en',1,'invented'), (2,'lichess','Invented Study','B. Writer','en',2,NULL)").run()
  const game = db.prepare('INSERT INTO comment_games (id, source_id, white, black, label, pgn) VALUES (?,?,?,?,?,?)')
  game.run('1-1', 1, 'W1', 'B1', 'W1 – B1', '1. e4 e5 {x}')
  game.run('1-2', 1, 'W2', 'B2', 'W2 – B2', '1. d4 d5')
  game.run('2-1', 2, 'W3', 'B3', 'W3 – B3', '1. c4 c5')
  const ins = db.prepare('INSERT INTO position_comments (hash, position, game_id, ply, move_number, san, lang, text, hidden_at) VALUES (?,?,?,?,?,?,?,?,?)')
  // book comments: P1 has 5, P2 has 4, P3 has 1; lichess: 3 on P4
  for (let i = 0; i < 5; i++) ins.run('aa00000000000001', 'fen-P1', i % 2 ? '1-2' : '1-1', 10, 5, 'Nf3', 'en', `book comment P1 #${i}`, null)
  for (let i = 0; i < 4; i++) ins.run('bb00000000000002', 'fen-P2', '1-1', 12, 6, 'Bb5', 'en', `book comment P2 #${i}`, null)
  ins.run('cc00000000000003', 'fen-P3', '1-2', 14, 7, 'O-O', 'en', 'book comment P3 #0', null)
  ins.run('cc00000000000003', 'fen-P3', '1-2', 14, 7, 'O-O', 'en', 'hidden book comment', '2026-01-01')
  for (let i = 0; i < 3; i++) ins.run('dd00000000000004', 'fen-P4', '2-1', 8, 4, 'c5', 'en', `lichess comment #${i}`, null)
  // normalized (own language rows) and a Spanish translation of the first comment
  db.prepare("INSERT INTO comment_translations (comment_id, lang, text) VALUES (1,'en','normalized one'), (1,'es','normalizado uno'), (2,'en','')").run()
  db.close()
  return path
}

const json = (data, status = 200) => ({ ok: status < 400, status, json: async () => data, text: async () => JSON.stringify(data) })
function fakeFetch(files, { calls = [] } = {}) {
  const fn = async (url, init = {}) => {
    calls.push({ url, headers: init.headers ?? {} })
    if (/\/git\/trees\//.test(url)) return json({ tree: Object.entries(files).map(([path, c]) => ({ path, type: 'blob', size: c.length })), truncated: false })
    const m = /\/contents\/(.+?)\?ref=/.exec(url)
    if (m && files[m[1]] !== undefined) return { ok: true, status: 200, text: async () => files[m[1]], json: async () => JSON.parse(files[m[1]]) }
    return json({ message: 'Not Found' }, 404)
  }
  fn.calls = calls
  return fn
}

describe('localStats', () => {
  it('counts the database and what a publish would write (hidden comments left out)', () => {
    const p = makeDb(tmp())
    const s = localStats(p)
    expect(s.comments).toBe(13) // 14 rows, 1 hidden
    expect(s.byKind).toEqual({ book: { en: 10 }, lichess: { en: 3 } })
    expect(s.hidden).toBe(1)
    expect(s.sources).toBe(2)
    expect(s.games).toBe(3)
    expect(s.translations).toBe(3)
    expect(s.normalized).toEqual({ en: { ok: 1, dropped: 1 } })
    expect(s.translatedByLang).toEqual({ es: 1 })
    expect(s.bytes).toBeGreaterThan(0)
  })
})

describe('remoteStats', () => {
  const files = { 'index.json': JSON.stringify({ total: 7, translations: 2, sources: { 1: {}, 2: {} }, built: 'T' }), 'p/aa.json': '{}', 'p/bb.json': '{}', 'g/1-1.json': '{}', 'comments.sqlite': 'x'.repeat(100), 'comments-index/meta.json': '{"total":7}' }
  it('reads the tree and index.json through the API, sending the token only to api.github.com', async () => {
    const f = fakeFetch(files)
    const r = await remoteStats({ fetch: f, token: TOKEN, repo: 'o/n', branch: 'main' })
    expect(r).toMatchObject({ ok: true, files: 6, shards: 2, games: 1, dbBytes: 100, total: 7, translations: 2, sources: 2, built: 'T' })
    for (const c of f.calls) { expect(c.url.startsWith('https://api.github.com/repos/o/n/')).toBe(true); expect(c.headers.Authorization).toBe(`Bearer ${TOKEN}`) }
    expect(JSON.stringify(r)).not.toContain(TOKEN)
  })
  it('reports a missing repository without throwing', async () => {
    const r = await remoteStats({ fetch: async () => json({ message: 'Not Found' }, 404), token: TOKEN, repo: 'o/n', branch: 'main' })
    expect(r.ok).toBe(false)
    expect(r.error).toMatch(/404/)
  })
  it('treats an empty repository (409) as empty', async () => {
    const r = await remoteStats({ fetch: async () => json({ message: 'Git Repository is empty.' }, 409), token: '', repo: 'o/n', branch: 'main' })
    expect(r).toMatchObject({ ok: true, files: 0, total: 0 })
  })
})

describe('resolveToken', () => {
  const spawnGh = (out, code = 0) => async () => ({ code, stdout: out, stderr: '' })
  it('prefers the secret, then gh, then the in-memory token', async () => {
    expect(await resolveToken({ getSecret: () => 'S', spawn: spawnGh('G\n'), memory: 'M' })).toEqual({ token: 'S', source: 'secret' })
    expect(await resolveToken({ getSecret: () => '', spawn: spawnGh('G\n'), memory: 'M' })).toEqual({ token: 'G', source: 'gh' })
    expect(await resolveToken({ getSecret: () => '', spawn: spawnGh('', 1), memory: 'M' })).toEqual({ token: 'M', source: 'memory' })
    expect(await resolveToken({ getSecret: () => '', spawn: spawnGh('', 1), memory: '' })).toEqual({ token: '', source: null })
  })
})

describe('settings', () => {
  it('keeps the sync key through saveSettings and loadSettings', () => {
    const home = tmp()
    saveSettings({ sync: { resourcesRepo: 'o/res', sampleRepo: 'o/sam', branch: 'main' } }, home)
    saveSettings({ concurrency: 2 }, home)
    expect(loadSettings(home).sync).toEqual({ resourcesRepo: 'o/res', sampleRepo: 'o/sam', branch: 'main' })
  })
})

describe('planSample', () => {
  const opts = { mode: 'top', topN: 2, perPosition: 3, seed: 'seed-1' }
  it('takes the N most commented book positions, up to 3 random comments each, reproducibly', () => {
    const p = makeDb(tmp())
    const a = planSample(p, opts)
    expect(a.positions).toBe(2)
    expect(a.comments).toBe(6) // P1: 3 of 5, P2: 3 of 4
    expect(a.ids.every((id) => id >= 1 && id <= 9)).toBe(true) // book comments only
    expect(planSample(p, opts).ids).toEqual(a.ids)
    expect(planSample(p, { ...opts, perPosition: 2 }).comments).toBe(4)
    expect(planSample(p, { ...opts, topN: 10 }).positions).toBe(3) // P3 has 1 visible book comment; the hidden one never counts
    expect(a.games).toBeGreaterThan(0)
  })
  it('applies the overall cap', () => {
    const p = makeDb(tmp())
    expect(planSample(p, { ...opts, cap: 4 }).comments).toBe(4)
  })
  it('lichess mode takes every Lichess comment', () => {
    const p = makeDb(tmp())
    const a = planSample(p, { mode: 'lichess' })
    expect(a.comments).toBe(3)
    expect(a.positions).toBe(1)
  })
})

describe('buildSampleDb + exportStatic', () => {
  it('copies the selected rows with a visible sample note and writes the static layout', () => {
    const dir = tmp()
    const p = makeDb(dir)
    const plan = planSample(p, { mode: 'top', topN: 1, perPosition: 3, seed: 's' })
    const out = join(dir, 'sample.sqlite')
    buildSampleDb(p, out, plan.ids, { noteEn: '[Sample] ', noteEs: '[Muestra] ' })
    const db = new DatabaseSync(out, { readOnly: true })
    const rows = db.prepare('SELECT text, lang FROM position_comments').all()
    expect(rows).toHaveLength(3)
    expect(rows.every((r) => r.text.startsWith('[Sample] '))).toBe(true)
    db.close()
    const site = join(dir, 'site')
    exportStatic(out, site, { note: 'x' })
    expect(existsSync(join(site, 'index.json'))).toBe(true)
    expect(existsSync(join(site, 'p', 'aa.json'))).toBe(true)
    expect(readdirSync(join(site, 'g')).length).toBeGreaterThan(0)
    const meta = JSON.parse(readFileSync(join(site, 'comments-index', 'meta.json'), 'utf8'))
    expect(meta.total).toBe(3)
    const shard = JSON.parse(readFileSync(join(site, 'p', 'aa.json'), 'utf8'))
    expect(shard['aa00000000000001']).toHaveLength(3)
  })
})

/** A fake spawner: records every command, simulates clone/build/git. */
function fakeSpawn({ changed = true, log = [] } = {}) {
  const fn = async (cmd, args, opts = {}) => {
    log.push({ cmd, args, env: opts.env ?? {}, cwd: opts.cwd })
    if (cmd === 'git' && args.includes('clone')) {
      const dest = args[args.length - 1]
      mkdirSync(join(dest, 'books'), { recursive: true })
      writeFileSync(join(dest, 'books', 'manifest.json'), '[]')
      writeFileSync(join(dest, 'README.md'), '# Repo\n')
      expect(existsSync(opts.env.GIT_ASKPASS)).toBe(true)
      return { code: 0, stdout: '', stderr: '' }
    }
    if (cmd === process.execPath) { // the build script
      const out = args[2]
      mkdirSync(join(out, 'p'), { recursive: true })
      writeFileSync(join(out, 'index.json'), '{"total":12}')
      writeFileSync(join(out, 'comments.sqlite'), 'db')
      writeFileSync(join(out, 'p', 'aa.json'), '{}')
      return { code: 0, stdout: 'total 12 comments', stderr: '' }
    }
    if (args.includes('status')) return { code: 0, stdout: changed ? ' M index.json\n?? p/aa.json\n' : '', stderr: '' }
    if (args.includes('rev-parse')) return { code: 0, stdout: 'abc1234\n', stderr: '' }
    if (args.includes('config')) return { code: 1, stdout: '', stderr: '' }
    return { code: 0, stdout: '', stderr: '' }
  }
  fn.log = log
  return fn
}

function setup({ changed = true } = {}) {
  const home = tmp()
  const db = makeDb(home)
  saveSettings({ dbPath: db, sync: { resourcesRepo: 'o/res', sampleRepo: 'o/sam', branch: 'main' } }, home)
  const spawn = fakeSpawn({ changed })
  const files = { 'index.json': JSON.stringify({ total: 1, translations: 0, sources: { 1: {} } }) }
  const sync = createSync({ home, settings: () => loadSettings(home) }, { fetch: fakeFetch(files), spawn, getSecret: () => TOKEN, tmpdir: () => tmpdir() })
  return { sync, spawn, home, db }
}
const wait = async (sync, id) => { for (let i = 0; i < 200; i++) { const j = sync.job(id); if (j.state !== 'running') return j; await new Promise((r) => setTimeout(r, 10)) } throw new Error('job never ended') }

describe('status route', () => {
  it('shows local, remote, differences and the token source, never the token', async () => {
    const { sync } = setup()
    const s = await sync.status({ target: 'resources' })
    expect(s.local.comments).toBe(13)
    expect(s.remote.total).toBe(1)
    expect(s.diff.find((d) => d.key === 'comments')).toMatchObject({ local: 13, remote: 1, delta: 12 })
    expect(s.token).toEqual({ available: true, source: 'secret' })
    expect(JSON.stringify(s)).not.toContain(TOKEN)
  })
  it('asks for the repository when none is set', async () => {
    const home = tmp()
    saveSettings({ dbPath: makeDb(home) }, home)
    const sync = createSync({ home, settings: () => loadSettings(home) }, { fetch: fakeFetch({}), spawn: fakeSpawn(), getSecret: () => '' })
    await expect(sync.status({ target: 'resources' })).rejects.toMatchObject({ status: 400 })
  })
  it('the in-memory token is reported by source only', async () => {
    const home = tmp()
    saveSettings({ dbPath: makeDb(home), sync: { resourcesRepo: 'o/res', branch: 'main' } }, home)
    const sync = createSync({ home, settings: () => loadSettings(home) }, { fetch: fakeFetch({}), spawn: async () => ({ code: 1, stdout: '', stderr: '' }), getSecret: () => '' })
    sync.setToken('typed-secret-token')
    const s = await sync.status({ target: 'resources' })
    expect(s.token).toEqual({ available: true, source: 'memory' })
    expect(JSON.stringify(s)).not.toContain('typed-secret-token')
  })
})

describe('publish', () => {
  it('refuses without a confirmation or without a dry run', async () => {
    const { sync } = setup()
    await expect(sync.publish({ target: 'resources', confirm: true })).rejects.toMatchObject({ status: 409 })
    await sync.status({ target: 'resources' })
    await expect(sync.publish({ target: 'resources' })).rejects.toMatchObject({ status: 400 })
  })

  it('resources: clones, builds with --translations, commits and pushes without the token on any command line and without force', async () => {
    const { sync, spawn, db } = setup()
    await sync.status({ target: 'resources' })
    const { id } = await sync.publish({ target: 'resources', confirm: true })
    const job = await wait(sync, id)
    expect(job.state).toBe('done')
    expect(job.result).toMatchObject({ sha: 'abc1234', files: 2 })
    const log = spawn.log
    const clone = log.find((l) => l.args.includes('clone'))
    expect(clone.args).toContain('https://github.com/o/res.git')
    const build = log.find((l) => l.cmd === process.execPath)
    expect(build.args[0]).toMatch(/build-comment-db\.mjs$/)
    expect(build.args).toContain('--translations')
    expect(build.args[build.args.indexOf('--translations') + 1]).toBe(db)
    const push = log.find((l) => l.args.includes('push'))
    expect(push.args).toContain('HEAD:main')
    expect(log.some((l) => l.args.some((a) => /force|^-f$|\+HEAD/.test(a)))).toBe(false)
    expect(log.some((l) => l.args.includes('commit'))).toBe(true)
    for (const l of log) {
      expect(JSON.stringify([l.cmd, l.args])).not.toContain(TOKEN)
      expect(Object.values(l.env).some((v) => String(v).includes(TOKEN))).toBe(false)
      if (l.cmd === 'git' && (l.args.includes('clone') || l.args.includes('push'))) expect(l.env.GIT_TERMINAL_PROMPT).toBe('0')
    }
    expect(JSON.stringify(job)).not.toContain(TOKEN)
    // the askpass directory is gone
    expect(existsSync(clone.env.GIT_ASKPASS)).toBe(false)
  })

  it('does not commit or push when nothing changed', async () => {
    const { sync, spawn } = setup({ changed: false })
    await sync.status({ target: 'resources' })
    const job = await wait(sync, (await sync.publish({ target: 'resources', confirm: true })).id)
    expect(job.state).toBe('done')
    expect(job.result.files).toBe(0)
    expect(spawn.log.some((l) => l.args.includes('push'))).toBe(false)
  })

  it('sample: needs its own dry run, shows the plan, writes the README section and pushes', async () => {
    const { sync, spawn } = setup()
    const opts = { mode: 'top', topN: 2, perPosition: 3, seed: 'abc' }
    const s = await sync.status({ target: 'sample', ...opts })
    expect(s.plan).toMatchObject({ comments: 6, positions: 2 })
    await expect(sync.publish({ target: 'sample', confirm: true, options: { ...opts, topN: 3 } })).rejects.toMatchObject({ status: 409 }) // options changed since the dry run
    const job = await wait(sync, (await sync.publish({ target: 'sample', confirm: true, options: opts })).id)
    expect(job.state).toBe('done')
    expect(spawn.log.some((l) => l.args.includes('push'))).toBe(true)
    expect(spawn.log.some((l) => l.cmd === process.execPath)).toBe(false) // the sample is exported from the sample database
  })

  it('a failing push ends the job with an error that does not contain the token', async () => {
    const { sync, spawn } = setup()
    const base = spawn
    const failing = async (cmd, args, o) => (args.includes('push') ? { code: 1, stdout: '', stderr: `remote: denied for ${TOKEN}` } : base(cmd, args, o))
    failing.log = base.log
    const home = tmp()
    saveSettings({ dbPath: makeDb(home), sync: { resourcesRepo: 'o/res', branch: 'main' } }, home)
    const s2 = createSync({ home, settings: () => loadSettings(home) }, { fetch: fakeFetch({}), spawn: failing, getSecret: () => TOKEN })
    await s2.status({ target: 'resources' })
    const job = await wait(s2, (await s2.publish({ target: 'resources', confirm: true })).id)
    expect(job.state).toBe('error')
    expect(JSON.stringify(job)).not.toContain(TOKEN)
  })
})
