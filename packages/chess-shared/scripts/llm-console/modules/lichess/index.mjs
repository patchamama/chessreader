// Lichess studies: the ones already in the commentary database, a preview of new ones, and adding them.
//
// How studies reach the database today (scripts/README.md, "Commentary from Lichess"):
//   1. harvest-lichess.mjs  config (studies / users / broadcasts) -> filtered PGN + manifest.json
//   2. build-comment-db.mjs manifest -> a NEW comments.sqlite (it deletes its output folder and rebuilds
//                           every source of the manifest; translations are carried over by position + text)
//   3. translate-comments.mjs normalizes and translates (the queue module).
// This module reuses the exported harvest functions by import and runs build-comment-db.mjs through an
// injectable spawner. Because that script rebuilds a whole folder, "Add" builds ONLY the chosen studies into a
// staging folder and copies the new sources, games and comments into the live database in one short
// transaction per source (existing rows and their translations are never touched). The static p/, g/ and
// comments-index/ files of a resources repository are not regenerated here; a full rebuild does that.
import { execFile } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import { openDb, withDb } from '../../lib/db.mjs'
import { USER_AGENT, attributionOf, filterGame, headersOf, humanComments, sourcesOf, splitPgnGames } from '../../../harvest-lichess.mjs'

const SCRIPTS = join(dirname(fileURLToPath(import.meta.url)), '../../..')
const run = promisify(execFile)
const ID = /^[A-Za-z0-9]{8}$/
const USER = /^[\w-]{2,30}$/
const httpError = (status, message) => Object.assign(new Error(message), { status })

/** What a ref (study url/id, @user, harvest list file as object or JSON text, or several of them) names. */
export function parseRef(ref) {
  let config
  if (ref && typeof ref === 'object') config = ref
  else {
    const text = String(ref ?? '').trim()
    if (!text) throw httpError(400, 'empty reference')
    if (text.startsWith('{')) {
      try { config = JSON.parse(text) } catch { throw httpError(400, 'invalid JSON list') }
    } else {
      const studies = [], users = []
      for (const tok of text.split(/[\s,]+/).filter(Boolean)) {
        const study = /lichess\.org\/study\/([A-Za-z0-9]{8})/.exec(tok)
        const user = /lichess\.org\/@\/([\w-]+)/.exec(tok) ?? /^@([\w-]+)$/.exec(tok)
        if (study) studies.push(study[1])
        else if (user) users.push(user[1])
        else if (ID.test(tok)) studies.push(tok)
        else if (USER.test(tok) && !/^https?:/.test(tok)) users.push(tok)
        else throw httpError(400, `cannot read "${tok.slice(0, 60)}" as a study, user or list`)
      }
      config = { studies, users }
    }
  }
  let sources
  try { sources = sourcesOf({ ...config, broadcasts: [] }) } catch (e) { throw httpError(400, e.message) }
  const pick = (kind) => sources.filter((s) => s.kind === kind).map((s) => ({ id: s.id, ...(config.lang || s.lang !== (config.lang ?? 'en') ? { lang: s.lang } : {}) }))
  const out = { studies: pick('study'), users: pick('user'), config }
  if (!out.studies.length && !out.users.length) throw httpError(400, 'no study or user found in the reference')
  return out
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
const defaultSleep = (ms) => new Promise((r) => setTimeout(r, ms))
const isTranslateRunning = (psText) => /scripts\/translate-comments\.mjs/.test(psText)
const tail = (s, n = 1500) => String(s ?? '').trim().slice(-n)

/** The service behind the routes. Everything outside the process (network, ps, spawn, clock) is injectable. */
export function createService({ settings, home, fetchImpl = (...a) => fetch(...a), sleep = defaultSleep, spawn = defaultSpawn, ps = defaultPs, env = process.env, delayMs = 2500, scriptsDir = SCRIPTS } = {}) {
  const state = { job: { running: false, step: '', log: [], result: null, error: null } }
  const sourcesFile = () => settings().lichessSources || join(home, 'lichess-sources.json')
  const readSources = () => { try { return JSON.parse(readFileSync(sourcesFile(), 'utf8')) } catch { return {} } }

  // ---- network (sequential, 429 aware, token only to lichess.org) ----
  const authed = (token) => (url, init = {}) => {
    let host = ''
    try { host = new URL(String(url)).hostname } catch { /* not a URL */ }
    const headers = { ...(init.headers ?? {}), ...(token && host === 'lichess.org' ? { Authorization: `Bearer ${token}` } : {}) }
    return fetchImpl(url, { ...init, headers })
  }
  async function get(url, { token, accept = 'application/x-chess-pgn', retries = 3 } = {}) {
    const f = authed(token)
    for (let attempt = 0; ; attempt++) {
      const res = await f(url, { headers: { 'User-Agent': USER_AGENT, Accept: accept }, signal: AbortSignal.timeout(300_000) })
      if (res.status === 200) return { text: await res.text(), headers: res.headers }
      if (res.status === 404) throw httpError(404, 'HTTP 404: not found or private (a token with study:read may be needed)')
      if (res.status === 401 || res.status === 403) throw httpError(res.status, `HTTP ${res.status}: the token is missing or not allowed`)
      if (attempt >= retries || (res.status !== 429 && res.status < 500)) throw httpError(502, `HTTP ${res.status}`)
      const retryAfter = Number(res.headers?.get?.('retry-after'))
      const wait = res.status === 429 ? (Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : 60_000 * (attempt + 1)) : 5_000 * 2 ** attempt
      await sleep(wait)
    }
  }

  // ---- existing studies ----
  /** Study id of every game of the lichess sources: { studyIds:Set, chapterUrls:Set }. */
  const inDbIndex = (db) => {
    const studyIds = new Set(), chapterUrls = new Set()
    for (const g of db.all("SELECT g.pgn FROM comment_games g JOIN comment_sources s ON s.id=g.source_id WHERE s.kind='lichess'")) {
      const a = attributionOf(headersOf(g.pgn))
      if (a.studyId) studyIds.add(a.studyId)
      if (a.chapterUrl) chapterUrls.add(a.chapterUrl)
    }
    return { studyIds, chapterUrls }
  }

  function listStudies() {
    const empty = { configured: false, studies: [], totals: { studies: 0, games: 0, comments: 0 } }
    const { dbPath } = settings()
    if (!dbPath) return empty
    return withDb(dbPath, (db) => {
      const games = db.all("SELECT g.id AS gid, g.source_id AS sid, g.white, g.black, g.pgn, s.title, s.author AS sauthor, s.lang AS slang FROM comment_games g JOIN comment_sources s ON s.id=g.source_id WHERE s.kind='lichess'")
      const counts = new Map(db.all(`SELECT c.game_id AS gid, COUNT(*) AS comments,
          SUM(t.text != '') AS normalized, SUM(t.text = '') AS dropped
          FROM position_comments c
          JOIN comment_games g ON g.id=c.game_id JOIN comment_sources s ON s.id=g.source_id AND s.kind='lichess'
          LEFT JOIN comment_translations t ON t.comment_id=c.id AND t.lang=c.lang GROUP BY c.game_id`).map((r) => [r.gid, r]))
      const translated = new Map(db.all(`SELECT c.game_id AS gid, COUNT(*) AS n FROM comment_translations t JOIN position_comments c ON c.id=t.comment_id
          JOIN comment_games g ON g.id=c.game_id JOIN comment_sources s ON s.id=g.source_id AND s.kind='lichess'
          WHERE t.lang != c.lang AND t.text != '' GROUP BY c.game_id`).map((r) => [r.gid, r.n]))
      const langs = new Map()
      for (const r of db.all(`SELECT c.game_id AS gid, c.lang AS lang FROM position_comments c JOIN comment_games g ON g.id=c.game_id JOIN comment_sources s ON s.id=g.source_id AND s.kind='lichess' GROUP BY c.game_id, c.lang`)) {
        if (!langs.has(r.gid)) langs.set(r.gid, new Set())
        langs.get(r.gid).add(r.lang)
      }
      const groups = new Map()
      for (const g of games) {
        const tags = headersOf(g.pgn)
        const a = attributionOf(tags)
        const key = a.studyId ?? `source:${g.sid}`
        const grp = groups.get(key) ?? groups.set(key, {
          studyId: a.studyId, sourceId: g.sid, sourceTitle: g.title, name: a.studyName ?? g.title.replace(/^Lichess (?:study|broadcast): /, ''), url: a.studyUrl,
          authors: new Set(), games: 0, comments: 0, normalized: 0, dropped: 0, translated: 0, langs: new Set(), dates: [],
        }).get(key)
        grp.games++
        if (a.author) grp.authors.add(a.author)
        for (const p of [g.white, g.black]) if (p && p !== '?') grp.authors.add(p)
        const c = counts.get(g.gid)
        if (c) { grp.comments += c.comments; grp.normalized += c.normalized ?? 0; grp.dropped += c.dropped ?? 0 }
        grp.translated += translated.get(g.gid) ?? 0
        for (const l of langs.get(g.gid) ?? []) grp.langs.add(l)
        const d = tags.UTCDate || tags.Date
        if (d && /\d/.test(d)) grp.dates.push(d)
        grp.sauthor = g.sauthor
      }
      const studies = [...groups.values()].map((g) => {
        g.dates.sort()
        const authors = [...g.authors]
        return {
          studyId: g.studyId, sourceId: g.sourceId, sourceTitle: g.sourceTitle, name: g.name, url: g.url,
          author: authors.length ? authors.slice(0, 3).join(', ') : g.sauthor ?? null,
          games: g.games, comments: g.comments, avgComments: g.games ? g.comments / g.games : 0,
          normalized: g.normalized, dropped: g.dropped, translated: g.translated, pending: Math.max(0, g.comments - g.normalized - g.dropped),
          langs: [...g.langs].sort(), firstDate: g.dates[0] ?? null, lastDate: g.dates.at(-1) ?? null,
        }
      }).sort((a, b) => b.comments - a.comments)
      return { configured: true, studies, totals: { studies: studies.length, games: studies.reduce((a, s) => a + s.games, 0), comments: studies.reduce((a, s) => a + s.comments, 0) } }
    })
  }

  // ---- preview ----
  const thresholds = (cfg) => ({ minComments: cfg.minComments ?? 3, minPlies: cfg.minPlies ?? 20, minCommentChars: cfg.minCommentChars ?? 20 })

  function summarize(id, text, headers, opts, extra) {
    const games = splitPgnGames(text)
    let annotated = 0, kept = 0, comments = 0, name = null
    const authors = new Map(), dates = []
    for (const raw of games) {
      const tags = headersOf(raw)
      const a = attributionOf(tags)
      name ??= a.studyName
      if (a.author) authors.set(a.author, (authors.get(a.author) ?? 0) + 1)
      if (tags.UTCDate && /\d/.test(tags.UTCDate)) dates.push(tags.UTCDate.replace(/\./g, '-'))
      if (humanComments(raw).length) annotated++
      const v = filterGame(raw, opts)
      if (v.keep) { kept++; comments += v.comments }
    }
    const lm = headers?.get?.('last-modified')
    const updated = extra.updated ?? (lm && !Number.isNaN(Date.parse(lm)) ? new Date(lm).toISOString() : dates.sort().at(-1) ?? null)
    const owner = extra.owner ?? [...authors.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null
    return { id, name: extra.name ?? name, url: `https://lichess.org/study/${id}`, owner, updated, created: extra.created ?? null, chapters: games.length, annotated, keptGames: kept, comments, lang: extra.lang }
  }

  async function preview({ ref, token, limit = 20 } = {}) {
    const tok = token || env.LICHESS_TOKEN || ''
    const { studies, users, config } = parseRef(ref)
    const fileCfg = readSources()
    const opts = thresholds({ ...fileCfg, ...config })
    const lang = config.lang ?? fileCfg.lang ?? 'en'
    const dbPath = settings().dbPath
    const index = dbPath && existsSync(dbPath) ? withDb(dbPath, inDbIndex) : { studyIds: new Set() }
    const inList = new Set((fileCfg.studies ?? []).map((s) => (typeof s === 'string' ? s : s.id)))
    const warnings = []
    const todo = studies.map((s) => ({ id: s.id, lang: s.lang ?? lang, extra: {} }))
    let requests = 0
    const pause = async () => { if (requests++ > 0) await sleep(delayMs) }
    for (const u of users) {
      await pause()
      try {
        const { text } = await get(`https://lichess.org/api/study/by/${u.id}`, { token: tok, accept: 'application/x-ndjson' })
        const listed = text.split('\n').filter(Boolean).map((l) => { try { return JSON.parse(l) } catch { return null } }).filter((s) => s?.id)
        if (listed.length > limit) warnings.push(`${u.id}: ${listed.length} studies, showing the first ${limit}`)
        for (const s of listed.slice(0, limit)) todo.push({ id: s.id, lang: u.lang ?? lang, extra: { owner: u.id, name: s.name, updated: s.updatedAt ? new Date(s.updatedAt).toISOString() : null, created: s.createdAt ? new Date(s.createdAt).toISOString() : null } })
      } catch (e) { warnings.push(`${u.id}: ${e.message}`) }
    }
    const seen = new Set()
    const out = []
    for (const item of todo) {
      if (seen.has(item.id)) continue
      seen.add(item.id)
      await pause()
      try {
        const { text, headers } = await get(sourcesOf({ studies: [item.id] })[0].url, { token: tok })
        const s = summarize(item.id, text, headers, opts, { ...item.extra, lang: item.lang })
        out.push({ ...s, inDb: index.studyIds.has(item.id), inList: inList.has(item.id) })
      } catch (e) { out.push({ id: item.id, url: `https://lichess.org/study/${item.id}`, error: e.message }) }
    }
    return { studies: out, warnings, filter: opts }
  }

  // ---- add ----
  const log = (msg) => { state.job.log.push(msg); if (state.job.log.length > 200) state.job.log.shift() }

  /** Copies the sources of the staging database that are not in the live one yet. One short transaction per source. */
  function merge(livePath, stagingPath) {
    const staging = openDb(stagingPath, { readOnly: true })
    const live = openDb(livePath, { readOnly: false })
    const added = [], skipped = []
    try {
      const cols = (db, table) => db.all(`PRAGMA table_info(${table})`).map((c) => c.name)
      const shared = (table) => cols(staging, table).filter((c) => c !== 'id' && cols(live, table).includes(c))
      const sourceCols = shared('comment_sources'), gameCols = shared('comment_games').filter((c) => c !== 'source_id'), commentCols = shared('position_comments').filter((c) => c !== 'game_id')
      const { chapterUrls } = inDbIndex(live)
      for (const src of staging.all("SELECT * FROM comment_sources WHERE kind='lichess' ORDER BY id")) {
        const games = staging.all('SELECT * FROM comment_games WHERE source_id=? ORDER BY id', src.id)
        const fresh = games.filter((g) => { const u = attributionOf(headersOf(g.pgn)).chapterUrl; return !(u && chapterUrls.has(u)) })
        for (const g of games) if (!fresh.includes(g)) skipped.push({ source: src.title, game: g.label, reason: 'chapter already in the database' })
        if (!fresh.length) continue
        live.exec('BEGIN IMMEDIATE')
        try {
          const sid = (live.get('SELECT COALESCE(MAX(id), 0) + 1 AS n FROM comment_sources').n)
          live.run(`INSERT INTO comment_sources (id, ${sourceCols.join(', ')}) VALUES (?${', ?'.repeat(sourceCols.length)})`, sid, ...sourceCols.map((c) => src[c]))
          let comments = 0
          fresh.forEach((g, i) => {
            const gid = `${sid}-${i + 1}`
            live.run(`INSERT INTO comment_games (id, source_id, ${gameCols.join(', ')}) VALUES (?, ?${', ?'.repeat(gameCols.length)})`, gid, sid, ...gameCols.map((c) => g[c]))
            for (const c of staging.all('SELECT * FROM position_comments WHERE game_id=? ORDER BY id', g.id)) {
              live.run(`INSERT INTO position_comments (game_id, ${commentCols.join(', ')}) VALUES (?${', ?'.repeat(commentCols.length)})`, gid, ...commentCols.map((k) => c[k]))
              comments++
            }
            const u = attributionOf(headersOf(g.pgn)).chapterUrl
            if (u) chapterUrls.add(u)
          })
          live.exec('COMMIT')
          added.push({ sourceId: sid, title: src.title, author: src.author, games: fresh.length, comments })
        } catch (e) { try { live.exec('ROLLBACK') } catch { /* already rolled back */ } throw e }
      }
    } finally { staging.close(); live.close() }
    return { added, skipped }
  }

  async function add({ studies, token } = {}) {
    if (!Array.isArray(studies) || !studies.length) throw httpError(400, 'choose at least one study')
    const chosen = studies.map((s) => (typeof s === 'string' ? { id: s } : s))
    for (const s of chosen) if (!ID.test(s?.id ?? '')) throw httpError(400, `invalid study id: ${String(s?.id).slice(0, 20)}`)
    const { dbPath } = settings()
    if (!dbPath) throw httpError(400, 'no database set: choose one in the settings')
    if (state.job.running) throw httpError(409, 'a Lichess job is already running')
    if (isTranslateRunning(await ps())) throw httpError(409, 'a translate-comments.mjs process is running: wait for it to finish (only one process may write the database)')
    const tok = token || env.LICHESS_TOKEN || ''
    state.job = { running: true, step: 'harvest', log: [], result: null, error: null, startedAt: new Date().toISOString() }
    const work = join(home, 'lichess-work', String(Date.now()))
    try {
      const list = readSources()
      const cfg = { ...list, studies: chosen, users: [], broadcasts: [], maxGames: list.maxGames ?? 5000, delayMs }
      const { harvest } = await import('../../../harvest-lichess.mjs')
      log(`harvest ${chosen.map((s) => s.id).join(', ')}`)
      await harvest(cfg, { out: work, fetchImpl: authed(tok), sleep, log })
      const manifestPath = join(work, 'lichess', 'manifest.json')
      if (!existsSync(manifestPath) || !JSON.parse(readFileSync(manifestPath, 'utf8')).length) throw httpError(422, 'no chapter passed the quality filter, nothing to add')
      state.job.step = 'build'
      const staging = join(work, 'db')
      log('build-comment-db (staging folder, the live database is not touched)')
      const res = await spawn(process.execPath, [join(scriptsDir, 'build-comment-db.mjs'), manifestPath, staging], { cwd: join(scriptsDir, '..') })
      log(tail(res.stdout))
      if (res.code !== 0) throw httpError(500, `build-comment-db.mjs failed (exit ${res.code}): ${tail(res.stderr)}`)
      state.job.step = 'merge'
      if (isTranslateRunning(await ps())) throw httpError(409, 'a translate-comments.mjs process started meanwhile; nothing was written')
      const { added, skipped } = merge(dbPath, join(staging, 'comments.sqlite'))
      log(`merged ${added.length} source(s)`)
      // The harvester's sources list gets the chosen studies only once the database has them.
      const known = new Set((list.studies ?? []).map((s) => (typeof s === 'string' ? s : s.id)))
      const next = { ...list, studies: [...(list.studies ?? []), ...chosen.filter((s) => !known.has(s.id)).map((s) => (s.lang ? { id: s.id, lang: s.lang } : s.id))] }
      mkdirSync(dirname(sourcesFile()), { recursive: true })
      writeFileSync(`${sourcesFile()}.tmp`, JSON.stringify(next, null, 1))
      renameSync(`${sourcesFile()}.tmp`, sourcesFile())
      const result = { added, skipped, sourcesFile: sourcesFile(), output: tail(res.stdout), note: 'Static p/, g/ and comments-index/ files are not regenerated: run build-comment-db.mjs on the full manifest to publish them. Queue normalization and translation for the new comments in the Queue tab.' }
      state.job = { ...state.job, running: false, step: 'done', result }
      return result
    } catch (e) {
      state.job = { ...state.job, running: false, step: 'failed', error: e.message }
      throw e
    } finally {
      rmSync(work, { recursive: true, force: true })
    }
  }

  return { listStudies, preview, add, job: () => state.job, sourcesFile }
}

export default {
  routes(app, ctx) {
    const svc = createService({ settings: () => ctx.settings(), home: ctx.home })
    app.get('/api/lichess/studies', () => svc.listStudies())
    app.get('/api/lichess/job', () => svc.job())
    app.post('/api/lichess/preview', async (c) => svc.preview(await c.body()))
    app.post('/api/lichess/add', async (c) => svc.add(await c.body()))
  },
}
