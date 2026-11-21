// Publish tab: update the external resources repository (private: comment database and the shards the
// deployed app reads) and the public sample repository from the local comments database.
//
// How it works (decisions):
//  - Remote statistics come from the GitHub API (git tree + index.json), read-only and cheap: no clone is
//    needed to compare. A clone is made only when publishing.
//  - The resources repository is rebuilt with scripts/build-comment-db.mjs (spawned, never reimplemented) from
//    the repository's own books/manifest.json, with `--translations <local database>` so the translations and
//    hidden comments (tombstones) of the local database reach the static files.
//  - That script reads book texts / PGN files, not a sqlite, so it cannot build the sample from sampled rows.
//    The sample is copied into a temp sqlite (same schema) and written to the same static layout by
//    exportStatic() below (comments.sqlite, index.json, p/, g/, comments-index/).
//  - The token never appears on a command line: git gets it through a GIT_ASKPASS helper that reads a 0600
//    file in a temp directory (removed at the end). Pushes are never forced.
import { execFile } from 'node:child_process'
import { chmodSync, copyFileSync, cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createHash, randomUUID } from 'node:crypto'
import { openDb, withDb } from '../../lib/db.mjs'
import { getSecret as readSecret, saveSettings } from '../../lib/config.mjs'

const BUILD_SCRIPT = fileURLToPath(new URL('../../../build-comment-db.mjs', import.meta.url))
const MIGRATIONS = new URL('../../../../../../apps/api/migrations/', import.meta.url)
const OUTPUTS = ['p', 'g', 'comments-index', 'comments.sqlite', 'index.json']
const PAGE_SIZE = 2000
const REPO_RE = /^[\w.-]+\/[\w.-]+$/
const err = (message, status = 400) => Object.assign(new Error(message), { status })

/** Real process spawner: never throws, resolves { code, stdout, stderr }. */
export function realSpawn(cmd, args, { cwd, env } = {}) {
  return new Promise((resolve) => {
    execFile(cmd, args, { cwd, env, maxBuffer: 256 * 1024 * 1024, windowsHide: true }, (e, stdout, stderr) => {
      resolve({ code: e ? (typeof e.code === 'number' ? e.code : 1) : 0, stdout: String(stdout ?? ''), stderr: String(stderr ?? '') || (e && typeof e.code !== 'number' ? e.message : '') })
    })
  })
}

// ---------- local statistics ----------

const hasColumn = (db, table, col) => db.all(`PRAGMA table_info(${table})`).some((c) => c.name === col)
const hasTable = (db, name) => !!db.get("SELECT 1 AS x FROM sqlite_master WHERE type='table' AND name=?", name)
/** SQL predicate for a comment that is visible: not hidden (the column may not exist in older databases). */
const visibleSql = (db, alias = 'c') => (hasColumn(db, 'position_comments', 'hidden_at') ? `${alias}.hidden_at IS NULL` : '1=1')

/** What the local database holds, and what a publish would write (hidden comments left out). */
export function localStats(dbPath) {
  const bytes = statSync(dbPath).size
  return withDb(dbPath, (db) => {
    const vis = visibleSql(db)
    const base = `FROM position_comments c JOIN comment_games g ON g.id=c.game_id JOIN comment_sources s ON s.id=g.source_id WHERE ${vis}`
    const byKind = {}
    for (const r of db.all(`SELECT s.kind AS kind, c.lang AS lang, COUNT(*) AS n ${base} GROUP BY 1,2`)) (byKind[r.kind] ??= {})[r.lang] = r.n
    const normalized = {}
    for (const r of db.all(`SELECT c.lang AS lang, SUM(t.text != '') AS ok, SUM(t.text = '') AS dropped FROM position_comments c JOIN comment_translations t ON t.comment_id=c.id AND t.lang=c.lang WHERE ${vis} GROUP BY 1`)) {
      normalized[r.lang] = { ok: r.ok ?? 0, dropped: r.dropped ?? 0 }
    }
    const translatedByLang = {}
    for (const r of db.all(`SELECT t.lang AS lang, COUNT(*) AS n FROM comment_translations t JOIN position_comments c ON c.id=t.comment_id WHERE ${vis} AND t.lang != c.lang AND t.text != '' GROUP BY 1`)) translatedByLang[r.lang] = r.n
    const total = (sql) => db.get(sql).n
    return {
      bytes,
      comments: total(`SELECT COUNT(*) AS n FROM position_comments c WHERE ${vis}`),
      hidden: hasColumn(db, 'position_comments', 'hidden_at') ? total('SELECT COUNT(*) AS n FROM position_comments WHERE hidden_at IS NOT NULL') : 0,
      tombstones: hasTable(db, 'comment_tombstones') ? total('SELECT COUNT(*) AS n FROM comment_tombstones') : 0,
      byKind, normalized, translatedByLang,
      translations: total(`SELECT COUNT(*) AS n FROM comment_translations t JOIN position_comments c ON c.id=t.comment_id WHERE ${vis}`),
      sources: total(`SELECT COUNT(DISTINCT g.source_id) AS n ${base}`),
      games: total(`SELECT COUNT(DISTINCT c.game_id) AS n FROM position_comments c WHERE ${vis}`),
      shards: total(`SELECT COUNT(DISTINCT substr(c.hash,1,2)) AS n FROM position_comments c WHERE ${vis}`),
    }
  })
}

// ---------- remote statistics (GitHub API) ----------

const redactor = (token) => (text) => (token ? String(text ?? '').split(token).join('***') : String(text ?? ''))

/** What the target repository holds: file counts and sizes from the git tree, plus index.json's figures. */
export async function remoteStats({ fetch, token, repo, branch }) {
  const redact = redactor(token)
  const headers = { Accept: 'application/vnd.github+json', 'User-Agent': 'llm-console', ...(token ? { Authorization: `Bearer ${token}` } : {}) }
  const api = `https://api.github.com/repos/${repo}`
  const empty = { ok: true, files: 0, bytes: 0, shards: 0, games: 0, dbBytes: 0, total: 0, translations: 0, sources: 0, built: null }
  try {
    const r = await fetch(`${api}/git/trees/${encodeURIComponent(branch)}?recursive=1`, { headers })
    if (r.status === 409) return empty
    if (!r.ok) return { ok: false, error: `GitHub answered ${r.status} for ${repo}${r.status === 404 ? ' (not found, or the token cannot read it)' : r.status === 401 || r.status === 403 ? ' (token rejected or without access)' : ''}` }
    const tree = await r.json()
    const blobs = (tree.tree ?? []).filter((e) => e.type === 'blob')
    const out = { ...empty, files: blobs.length, bytes: blobs.reduce((a, b) => a + (b.size ?? 0), 0), truncated: !!tree.truncated,
      shards: blobs.filter((b) => b.path.startsWith('p/')).length, games: blobs.filter((b) => b.path.startsWith('g/')).length,
      dbBytes: blobs.find((b) => b.path === 'comments.sqlite')?.size ?? 0 }
    if (blobs.some((b) => b.path === 'index.json')) {
      const ir = await fetch(`${api}/contents/index.json?ref=${encodeURIComponent(branch)}`, { headers: { ...headers, Accept: 'application/vnd.github.raw+json' } })
      if (ir.ok) {
        try {
          const idx = JSON.parse(await ir.text())
          Object.assign(out, { total: idx.total ?? 0, translations: idx.translations ?? 0, sources: Object.keys(idx.sources ?? {}).length, built: idx.built ?? null })
        } catch { /* unreadable index.json: counts stay 0 */ }
      }
    }
    return out
  } catch (e) {
    return { ok: false, error: `Could not reach GitHub: ${redact(e.message)}` }
  }
}

/** Side-by-side figures of what would be written (local) and what is there (remote). */
export function diffStats(expected, remote) {
  if (!remote?.ok) return []
  return ['comments', 'translations', 'sources', 'games', 'shards']
    .filter((k) => expected[k] !== undefined)
    .map((k) => {
      const r = k === 'comments' ? remote.total : remote[k]
      return { key: k, local: expected[k], remote: r, delta: expected[k] - r }
    })
}

// ---------- token ----------

/** The GitHub token and where it comes from: the console's secrets / GITHUB_TOKEN, `gh auth token`, else the in-memory one. */
export async function resolveToken({ getSecret, spawn, memory }) {
  const s = getSecret('github')
  if (s) return { token: s, source: 'secret' }
  try {
    const r = await spawn('gh', ['auth', 'token'], {})
    const t = r.code === 0 ? r.stdout.trim() : ''
    if (t) return { token: t, source: 'gh' }
  } catch { /* gh not installed */ }
  if (memory) return { token: memory, source: 'memory' }
  return { token: '', source: null }
}

// ---------- sample selection ----------

function rng(seed) { // mulberry32 over a hash of the seed text
  let a = createHash('sha256').update(String(seed)).digest().readUInt32LE(0)
  return () => { a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296 }
}
function shuffle(list, seed) {
  const r = rng(seed), a = [...list]
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [a[i], a[j]] = [a[j], a[i]] }
  return a
}
const int = (v, d, min, max) => { const n = Number(v); return Number.isFinite(n) && n >= min ? Math.min(max, Math.floor(n)) : d }

/** The sample options with defaults (the same normalization for the dry run and the publish). */
export function sampleOptions(o = {}) {
  return {
    mode: o.mode === 'lichess' ? 'lichess' : 'top',
    topN: int(o.topN, 100, 1, 100000),
    perPosition: int(o.perPosition, 3, 1, 3),
    cap: o.cap === undefined || o.cap === null || o.cap === '' ? null : int(o.cap, null, 1, 1000000),
    seed: String(o.seed || 'sample'),
    noteEn: typeof o.noteEn === 'string' ? o.noteEn : '[Sample] ',
    noteEs: typeof o.noteEs === 'string' ? o.noteEs : '[Muestra] ',
  }
}

/** Which comments the sample holds: ids, and its size in comments, positions (same `hash` as the database), games, sources. */
export function planSample(dbPath, options) {
  const o = sampleOptions(options)
  return withDb(dbPath, (db) => {
    const live = `${visibleSql(db)} AND NOT EXISTS (SELECT 1 FROM comment_translations t WHERE t.comment_id=c.id AND t.lang=c.lang AND t.text='')`
    const from = 'FROM position_comments c JOIN comment_games g ON g.id=c.game_id JOIN comment_sources s ON s.id=g.source_id'
    let ids = []
    if (o.mode === 'lichess') {
      ids = db.all(`SELECT c.id AS id ${from} WHERE s.kind='lichess' AND ${live} ORDER BY c.id`).map((r) => r.id)
    } else {
      const top = db.all(`SELECT c.hash AS hash, COUNT(*) AS n ${from} WHERE s.kind='book' AND ${live} GROUP BY c.hash ORDER BY n DESC, c.hash ASC LIMIT ?`, o.topN)
      for (const { hash } of top) {
        const all = db.all(`SELECT c.id AS id ${from} WHERE s.kind='book' AND ${live} AND c.hash=? ORDER BY c.id`, hash).map((r) => r.id)
        ids.push(...shuffle(all, `${o.seed}|${hash}`).slice(0, o.perPosition))
      }
    }
    if (o.cap && ids.length > o.cap) ids = shuffle(ids, `${o.seed}|cap`).slice(0, o.cap)
    ids.sort((a, b) => a - b)
    const stats = { positions: 0, games: 0, sources: 0 }
    if (ids.length) {
      const where = `c.id IN (${ids.map(() => '?').join(',')})`
      const r = db.get(`SELECT COUNT(DISTINCT c.hash) AS p, COUNT(DISTINCT c.game_id) AS g, COUNT(DISTINCT g.source_id) AS s ${from} WHERE ${where}`, ...ids)
      Object.assign(stats, { positions: r.p, games: r.g, sources: r.s })
    }
    return { ids, comments: ids.length, ...stats, options: o }
  })
}

const SCHEMA_FIX = ['ALTER TABLE position_comments ADD COLUMN move_number INTEGER', 'ALTER TABLE position_comments ADD COLUMN chapter INTEGER', 'ALTER TABLE position_comments ADD COLUMN hidden_at TEXT', 'ALTER TABLE comment_sources ADD COLUMN book_id TEXT']

/** Copies the selected comments (with their games, sources and translations) into a new sqlite, each text starting with the sample note. */
export function buildSampleDb(srcPath, outPath, ids, { noteEn = '[Sample] ', noteEs = '[Muestra] ' } = {}) {
  rmSync(outPath, { force: true })
  const note = (lang) => (lang === 'es' ? noteEs : noteEn)
  const out = openDb(outPath, { readOnly: false })
  try {
    out.exec(readFileSync(new URL('005_position_comments.sql', MIGRATIONS), 'utf8'))
    for (const sql of SCHEMA_FIX) out.exec(sql)
    out.exec(readFileSync(new URL('008_comment_tombstones.sql', MIGRATIONS), 'utf8'))
    withDb(srcPath, (src) => {
      const hasBook = hasColumn(src, 'comment_sources', 'book_id')
      const hasMove = hasColumn(src, 'position_comments', 'move_number')
      const hasChapter = hasColumn(src, 'position_comments', 'chapter')
      out.exec('BEGIN')
      const doneSources = new Set(), doneGames = new Set()
      for (const id of ids) {
        const c = src.get('SELECT * FROM position_comments WHERE id=?', id)
        if (!c) continue
        const g = src.get('SELECT * FROM comment_games WHERE id=?', c.game_id)
        if (!doneSources.has(g.source_id)) {
          const s = src.get('SELECT * FROM comment_sources WHERE id=?', g.source_id)
          out.run('INSERT INTO comment_sources (id, kind, title, author, lang, priority, book_id) VALUES (?,?,?,?,?,?,?)', s.id, s.kind, s.title, s.author, s.lang, s.priority, hasBook ? s.book_id : null)
          doneSources.add(g.source_id)
        }
        if (!doneGames.has(g.id)) { out.run('INSERT INTO comment_games (id, source_id, white, black, label, pgn) VALUES (?,?,?,?,?,?)', g.id, g.source_id, g.white, g.black, g.label, g.pgn); doneGames.add(g.id) }
        const trans = src.all('SELECT lang, text FROM comment_translations WHERE comment_id=? ORDER BY lang', id)
        const own = trans.find((t) => t.lang === c.lang && t.text)
        out.run('INSERT INTO position_comments (id, hash, position, game_id, ply, move_number, san, lang, text, chapter) VALUES (?,?,?,?,?,?,?,?,?,?)',
          c.id, c.hash, c.position, c.game_id, c.ply, hasMove ? c.move_number : null, c.san, c.lang, note(c.lang) + (own ? own.text : c.text), hasChapter ? c.chapter : null)
        for (const t of trans) if (t.text) out.run('INSERT INTO comment_translations (comment_id, lang, text) VALUES (?,?,?)', id, t.lang, note(t.lang) + t.text)
      }
      out.exec('COMMIT')
    })
  } finally { out.close() }
}

/** Writes the static layout of build-comment-db.mjs (comments.sqlite, index.json, p/, g/, comments-index/) from a comments sqlite. */
export function exportStatic(dbPath, outDir) {
  rmSync(outDir, { recursive: true, force: true })
  for (const d of ['p', 'g', 'comments-index']) mkdirSync(join(outDir, d), { recursive: true })
  copyFileSync(dbPath, join(outDir, 'comments.sqlite'))
  withDb(dbPath, (db) => {
    const vis = visibleSql(db)
    const hasMove = hasColumn(db, 'position_comments', 'move_number')
    const hasChapter = hasColumn(db, 'position_comments', 'chapter')
    const hasBook = hasColumn(db, 'comment_sources', 'book_id')
    const rows = db.all(`SELECT c.*, g.white, g.black, g.label, g.source_id, g.pgn FROM position_comments c JOIN comment_games g ON g.id=c.game_id WHERE ${vis} ORDER BY c.id`)
    const trans = new Map()
    for (const t of db.all('SELECT comment_id, lang, text FROM comment_translations ORDER BY comment_id, lang')) (trans.get(t.comment_id) ?? trans.set(t.comment_id, {}).get(t.comment_id))[t.lang] = t.text
    const sources = {}
    for (const s of db.all('SELECT * FROM comment_sources ORDER BY id')) sources[s.id] = { kind: s.kind, title: s.title, author: s.author ?? null, lang: s.lang, priority: s.priority, book: hasBook ? s.book_id ?? null : null, comments: 0 }
    const shards = new Map(), listed = [], games = new Map()
    let translated = 0
    for (const r of rows) {
      const move = (hasMove ? r.move_number : null) ?? Math.ceil(r.ply / 2)
      const tr = trans.get(r.id)
      const extra = tr ? { translations: tr } : {}
      if (tr) translated += Object.keys(tr).length
      sources[r.source_id].comments++
      if (!games.has(r.game_id)) games.set(r.game_id, { id: r.game_id, source: r.source_id, white: r.white ?? undefined, black: r.black ?? undefined, pgn: r.pgn })
      listed.push({ id: r.id, hash: r.hash, fen: `${r.position} 0 1`, text: r.text, lang: r.lang, ply: r.ply, move, san: r.san, game: r.game_id, source: r.source_id, label: r.label || null, white: r.white ?? null, black: r.black ?? null, chapter: hasChapter ? r.chapter ?? null : null, ...extra })
      const shard = shards.get(r.hash.slice(0, 2)) ?? shards.set(r.hash.slice(0, 2), {}).get(r.hash.slice(0, 2))
      ;(shard[r.hash] ??= []).push({ id: r.id, text: r.text, lang: r.lang, game: r.game_id, ply: r.ply, move, san: r.san, source: r.source_id, label: r.label || null, ...extra })
    }
    for (const [id, g] of games) writeFileSync(join(outDir, 'g', `${id}.json`), JSON.stringify(g))
    const pages = Math.ceil(listed.length / PAGE_SIZE)
    for (let n = 0; n < pages; n++) writeFileSync(join(outDir, 'comments-index', `${n}.json`), JSON.stringify({ page: n, comments: listed.slice(n * PAGE_SIZE, (n + 1) * PAGE_SIZE) }))
    writeFileSync(join(outDir, 'comments-index', 'meta.json'), JSON.stringify({ version: 1, total: listed.length, pages, pageSize: PAGE_SIZE, page: 'comments-index/<n>.json', sources }, null, 1))
    for (const [prefix, shard] of shards) writeFileSync(join(outDir, 'p', `${prefix}.json`), JSON.stringify(shard))
    writeFileSync(join(outDir, 'index.json'), JSON.stringify({ version: 1, built: new Date().toISOString(), hash: 'fnv1a64(fen without move counters)', shard: 'p/<first 2 hex>.json', games: 'g/<id>.json', minPly: 8, total: listed.length, errata: 0, ...(translated ? { translations: translated } : {}), sources }, null, 1))
  })
}

const README_START = '<!-- llm-console:sample:start -->'
const README_END = '<!-- llm-console:sample:end -->'
/** The README section that says this repository is a sample and how it was made (English and Spanish). */
export function sampleReadmeSection(plan, date) {
  const o = plan.options
  const how = o.mode === 'lichess'
    ? ['every comment of the Lichess studies', 'todos los comentarios de los estudios de Lichess']
    : [`the ${o.topN} most commented positions of the books, with at most ${o.perPosition} randomly chosen comments each (seed "${o.seed}")`,
      `las ${o.topN} posiciones más comentadas de los libros, con hasta ${o.perPosition} comentarios elegidos al azar en cada una (semilla "${o.seed}")`]
  return `${README_START}
## This is a sample / Esto es una muestra

**EN** — This repository is only a **sample** of the commented games (${plan.comments} comments, ${plan.positions} positions, ${plan.games} games, built ${date}). Selection: ${how[0]}${o.cap ? `, capped at ${o.cap} comments` : ''}. Every comment starts with the note "${o.noteEn.trim()}". It was generated with the LLM console (scripts/llm-console) from a local comments database; the full database lives in a private repository.

**ES** — Este repositorio es solo una **muestra** de las partidas comentadas (${plan.comments} comentarios, ${plan.positions} posiciones, ${plan.games} partidas, generada el ${date}). Selección: ${how[1]}${o.cap ? `, con un máximo de ${o.cap} comentarios` : ''}. Cada comentario empieza con la nota "${o.noteEs.trim()}". Se generó con la consola de LLM (scripts/llm-console) a partir de una base de datos local; la base completa está en un repositorio privado.
${README_END}
`
}
export function withReadmeSection(readme, section) {
  const a = readme.indexOf(README_START), b = readme.indexOf(README_END)
  if (a >= 0 && b > a) return readme.slice(0, a) + section.trimEnd() + readme.slice(b + README_END.length)
  return `${readme.trimEnd()}\n\n${section}`
}

// ---------- the sync service ----------

/** The routes' logic, with injectable fetch, spawn and secrets (tests use fakes). */
export function createSync(ctx, deps = {}) {
  const d = {
    fetch: deps.fetch ?? globalThis.fetch,
    spawn: deps.spawn ?? realSpawn,
    getSecret: deps.getSecret ?? ((name) => readSecret(name, ctx.home)),
    tmpdir: deps.tmpdir ?? tmpdir,
    platform: deps.platform ?? process.platform,
  }
  let memoryToken = ''
  const dryRuns = {}
  const jobs = new Map()
  let latest = null

  const syncSettings = () => ctx.settings().sync ?? {}
  const repoOf = (target) => {
    if (target !== 'resources' && target !== 'sample') throw err('target must be resources or sample')
    const cfg = syncSettings()
    const repo = target === 'resources' ? cfg.resourcesRepo : cfg.sampleRepo
    if (!repo) throw err(`set the ${target} repository (owner/name) first`)
    if (!REPO_RE.test(repo)) throw err('invalid repository: use owner/name')
    return { repo, branch: cfg.branch || 'main' }
  }
  const dbPathOf = () => { const p = ctx.settings().dbPath; if (!p || !existsSync(p)) throw err('no local comments database: choose one in the settings'); return p }
  const tokenInfo = () => resolveToken({ getSecret: d.getSecret, spawn: d.spawn, memory: memoryToken })
  const optionsOf = (target, raw) => (target === 'sample' ? sampleOptions({ ...syncSettings().sample, ...raw }) : null)

  async function status(query) {
    const target = query.target
    const { repo, branch } = repoOf(target)
    const dbPath = dbPathOf()
    const options = optionsOf(target, query)
    const { token, source } = await tokenInfo()
    const local = localStats(dbPath)
    const remote = await remoteStats({ fetch: d.fetch, token, repo, branch })
    const plan = target === 'sample' ? planSample(dbPath, options) : null
    const expected = plan ? { comments: plan.comments, games: plan.games, sources: plan.sources } : { comments: local.comments, translations: local.translations, sources: local.sources, games: local.games, shards: local.shards }
    if (remote.ok) dryRuns[target] = { at: Date.now(), key: JSON.stringify(options) }
    return { target, repo, branch, token: { available: !!token, source }, options, local, remote, diff: diffStats(expected, remote),
      plan: plan ? { comments: plan.comments, positions: plan.positions, games: plan.games, sources: plan.sources } : null, dryRunAt: remote.ok ? dryRuns[target].at : null }
  }

  const publicJob = (j) => j && ({ id: j.id, target: j.target, state: j.state, progress: j.progress, steps: j.steps, log: j.log.slice(-60), result: j.result, error: j.error, startedAt: j.startedAt, endedAt: j.endedAt })
  const job = (id) => publicJob(id ? jobs.get(id) : latest) ?? null

  async function publish({ target, confirm, options: rawOptions } = {}) {
    const { repo, branch } = repoOf(target)
    if (confirm !== true) throw err('confirm the publication first')
    const options = optionsOf(target, rawOptions ?? {})
    const dry = dryRuns[target]
    if (!dry || dry.key !== JSON.stringify(options)) throw err('run the dry run (statistics) first, with the same options', 409)
    if ([...jobs.values()].some((j) => j.state === 'running')) throw err('another publication is running', 409)
    const dbPath = dbPathOf()
    const { token } = await tokenInfo()
    if (!token) throw err('no GitHub token: set GITHUB_TOKEN, run `gh auth login`, or type one in the panel', 400)
    const j = { id: randomUUID(), target, state: 'running', progress: 0, steps: [], log: [], result: null, error: null, startedAt: Date.now(), endedAt: null }
    jobs.set(j.id, j)
    latest = j
    void run(j, { target, repo, branch, dbPath, options, token })
    return { id: j.id }
  }

  async function run(j, { target, repo, branch, dbPath, options, token }) {
    const redact = redactor(token)
    const work = mkdtempSync(join(d.tmpdir(), 'llm-console-sync-'))
    const step = (name, progress) => { const last = j.steps.at(-1); if (last) last.state = 'done'; j.steps.push({ name, state: 'running' }); j.progress = progress; j.log.push(name) }
    try {
      const ask = join(work, 'ask'); mkdirSync(ask)
      writeFileSync(join(ask, 'token'), token, { mode: 0o600 })
      const win = d.platform === 'win32'
      const askpass = join(ask, win ? 'askpass.cmd' : 'askpass.sh')
      writeFileSync(askpass, win
        ? '@echo off\r\necho %~1 | findstr /b /i "Username" >nul && (echo x-access-token) || (type "%~dp0token")\r\n'
        : '#!/bin/sh\ncase "$1" in Username*) echo x-access-token ;; *) cat "$(dirname "$0")/token" ;; esac\n', { mode: 0o700 })
      if (!win) chmodSync(askpass, 0o700)
      const env = { ...process.env, GIT_ASKPASS: askpass, GIT_TERMINAL_PROMPT: '0' }
      const exec = async (cmd, args, cwd, e = env) => {
        const r = await d.spawn(cmd, args, { cwd, env: e })
        if (r.code !== 0) throw new Error(redact(`${cmd} ${args[0] === '-c' ? args[3] ?? '' : args[0]} failed: ${(r.stderr || r.stdout).trim().slice(0, 600)}`))
        return r
      }
      const git = (args, cwd) => exec('git', args, cwd)
      const repoDir = join(work, 'repo')

      step(`clone ${repo}`, 0.1)
      await git(['clone', '--depth', '1', '--branch', branch, `https://github.com/${repo}.git`, repoDir], work)

      let message, summary
      let built
      if (target === 'resources') {
        const manifest = join(repoDir, 'books', 'manifest.json')
        if (!existsSync(manifest)) throw new Error('the repository has no books/manifest.json: the build script needs it')
        built = join(work, 'out')
        step('build the database and shards (build-comment-db.mjs)', 0.3)
        const args = [BUILD_SCRIPT, manifest, built, '--translations', dbPath]
        if (existsSync(join(repoDir, 'errata'))) args.push('--errata', join(repoDir, 'errata'))
        await exec(process.execPath, args, join(BUILD_SCRIPT, '..', '..'), process.env)
        const local = localStats(dbPath)
        message = `data: update commentary database (${local.comments} comments, ${local.translations} translations)`
        summary = { comments: local.comments }
      } else {
        step('select the sample', 0.25)
        const plan = planSample(dbPath, options)
        if (!plan.comments) throw new Error('the sample would be empty')
        const sdb = join(work, 'sample.sqlite')
        buildSampleDb(dbPath, sdb, plan.ids, options)
        built = join(work, 'out')
        step('write the static files of the sample', 0.4)
        exportStatic(sdb, built)
        const readme = join(repoDir, 'README.md')
        writeFileSync(readme, withReadmeSection(existsSync(readme) ? readFileSync(readme, 'utf8') : '# Sample\n', sampleReadmeSection(plan, new Date().toISOString().slice(0, 10))))
        message = `data: update the sample (${plan.comments} comments, ${plan.positions} positions)`
        summary = { comments: plan.comments, positions: plan.positions, games: plan.games }
      }

      step('copy into the repository', 0.55)
      for (const name of OUTPUTS) rmSync(join(repoDir, name), { recursive: true, force: true })
      for (const name of OUTPUTS) if (existsSync(join(built, name))) cpSync(join(built, name), join(repoDir, name), { recursive: true })
      await git(['add', '-A'], repoDir)
      const changed = (await git(['status', '--porcelain'], repoDir)).stdout.split('\n').filter((l) => l.trim()).length
      if (!changed) {
        const sha = (await git(['rev-parse', 'HEAD'], repoDir)).stdout.trim()
        j.result = { sha, files: 0, pushed: false, ...summary, note: 'nothing changed: nothing was committed or pushed' }
      } else {
        step('commit', 0.7)
        const hasIdentity = (await d.spawn('git', ['config', 'user.email'], { cwd: repoDir, env })).stdout.trim()
        await git([...(hasIdentity ? [] : ['-c', 'user.name=llm-console', '-c', 'user.email=llm-console@localhost']), 'commit', '-m', message], repoDir)
        step(`push to ${repo}@${branch}`, 0.85)
        await git(['push', 'origin', `HEAD:${branch}`], repoDir)
        const sha = (await git(['rev-parse', 'HEAD'], repoDir)).stdout.trim()
        j.result = { sha, files: changed, pushed: true, ...summary }
      }
      j.steps.forEach((s) => { s.state = 'done' })
      j.progress = 1
      j.state = 'done'
    } catch (e) {
      j.error = redact(e.message)
      j.steps.at(-1) && (j.steps.at(-1).state = 'error')
      j.state = 'error'
    } finally {
      j.endedAt = Date.now()
      rmSync(work, { recursive: true, force: true })
    }
  }

  return {
    status, publish, job,
    setToken: (t) => { memoryToken = String(t ?? '').trim() },
    async tokenStatus() { const { token, source } = await tokenInfo(); return { available: !!token, source } },
    getSettings: () => ({ resourcesRepo: '', sampleRepo: '', branch: 'main', sample: sampleOptions(syncSettings().sample), ...syncSettings(), ...{ sample: sampleOptions(syncSettings().sample) } }),
  }
}

export default {
  routes(app, ctx) {
    const sync = createSync(ctx)
    app.get('/api/sync/status', async (c) => sync.status(c.query))
    app.get('/api/sync/settings', async () => ({ sync: sync.getSettings(), token: await sync.tokenStatus() }))
    app.put('/api/sync/settings', async (c) => {
      const b = await c.body()
      const next = {}
      for (const k of ['resourcesRepo', 'sampleRepo']) if (k in b) { if (b[k] && !REPO_RE.test(b[k])) throw err(`invalid ${k}: use owner/name`); next[k] = b[k] ?? '' }
      if ('branch' in b) { if (!/^[\w./-]+$/.test(b.branch)) throw err('invalid branch'); next.branch = b.branch }
      if (b.sample) next.sample = sampleOptions(b.sample)
      saveSettings({ sync: next }, ctx.home)
      return { sync: sync.getSettings() }
    })
    // The typed token is kept in memory only: never written, never returned.
    app.put('/api/sync/token', async (c) => { sync.setToken((await c.body()).token); return { token: await sync.tokenStatus() } })
    app.post('/api/sync/publish', async (c) => sync.publish(await c.body()))
    app.get('/api/sync/job', (c) => ({ job: sync.job(c.query.id) }))
  },
}
