// What the run did and is doing: totals, progress per phase, the running job, speed, the latest results.
import { execFile } from 'node:child_process'
import { open, stat } from 'node:fs/promises'
import { promisify } from 'node:util'
import { withDb } from '../../lib/db.mjs'
import * as ollama from '../../lib/ollama.mjs'

const run = promisify(execFile)
const KEEP = 60
/** The phases shown when no queue module provides its own plan. */
const DEFAULT_PLAN = [{ phase: 'normalize', kind: 'book' }, { phase: 'normalize', kind: 'lichess' }, { phase: 'translate', kind: 'book' }, { phase: 'translate', kind: 'lichess' }]

/** One review file (JSON lines the translate script writes), read incrementally: counters and the latest entries. */
export function createReviewReader(path) {
  const state = { offset: 0, partial: '', counts: {}, recent: { universal: [], translate: [], problems: [] }, lines: 0 }
  const reset = () => Object.assign(state, { offset: 0, partial: '', counts: {}, recent: { universal: [], translate: [], problems: [] }, lines: 0 })
  const push = (list, e) => { list.push(e); if (list.length > KEEP) list.shift() }
  return {
    state,
    async read() {
      let size
      try { size = (await stat(path)).size } catch { return state }
      if (size < state.offset) reset()
      if (size === state.offset) return state
      const fh = await open(path, 'r')
      try {
        const buf = Buffer.alloc(size - state.offset)
        await fh.read(buf, 0, buf.length, state.offset)
        state.offset = size
        const parts = (state.partial + buf.toString('utf8')).split('\n')
        state.partial = parts.pop() ?? ''
        for (const line of parts) {
          if (!line) continue
          let d
          try { d = JSON.parse(line) } catch { continue }
          state.lines++
          const key = `${d.action}|${d.status}`
          state.counts[key] = (state.counts[key] ?? 0) + 1
          const slim = { id: d.id, lang: d.lang, action: d.action, status: d.status, model: d.model, original: d.original, proposal: d.proposal, problems: d.problems ?? [] }
          push(d.status === 'accepted' ? state.recent[d.action === 'universal' ? 'universal' : 'translate'] : state.recent.problems, slim)
        }
      } finally { await fh.close() }
      return state
    },
  }
}

/** The translate job running now, from `ps` (null when none). */
export function parseJob(psOutput) {
  const row = psOutput.split('\n').map((l) => l.trim()).find((l) => /scripts\/translate-comments\.mjs/.test(l))
  if (!row) return null
  const arg = (name) => new RegExp(`--${name} (\\S+)`).exec(row)?.[1] ?? null
  const [pid, elapsed] = row.split(/\s+/)
  return { pid: Number(pid), elapsed, phase: arg('phase'), kind: arg('source-kind'), onlyLang: arg('only-lang'), model: arg('model'), translateModel: arg('translate-model'), langs: (arg('langs') ?? 'es,en,de').split(','), concurrency: arg('concurrency') }
}

/** Totals, normalization and translation progress per source kind and language. */
export function countsOf(db, langs) {
  const rows = (sql) => db.all(sql)
  const base = 'FROM position_comments c JOIN comment_games g ON g.id=c.game_id JOIN comment_sources s ON s.id=g.source_id'
  const totals = rows(`SELECT s.kind AS kind, c.lang AS lang, COUNT(*) AS n ${base} GROUP BY 1,2`)
  const normalized = rows(`SELECT s.kind AS kind, c.lang AS lang, SUM(t.text != '') AS ok, SUM(t.text = '') AS dropped ${base} JOIN comment_translations t ON t.comment_id=c.id AND t.lang = c.lang GROUP BY 1,2`)
  const translated = rows(`SELECT s.kind AS kind, t.lang AS target, COUNT(*) AS n FROM comment_translations t JOIN position_comments c ON c.id=t.comment_id JOIN comment_games g ON g.id=c.game_id JOIN comment_sources s ON s.id=g.source_id WHERE t.lang != c.lang AND t.text != '' GROUP BY 1,2`)
  const eligible = rows(`SELECT s.kind AS kind, c.lang AS lang, COUNT(*) AS n ${base} JOIN comment_translations t ON t.comment_id=c.id AND t.lang = c.lang WHERE t.text != '' GROUP BY 1,2`)
  const out = {}
  for (const kind of [...new Set(totals.map((r) => r.kind))]) {
    const own = Object.fromEntries(totals.filter((r) => r.kind === kind).map((r) => [r.lang, r.n]))
    const norm = normalized.filter((r) => r.kind === kind)
    const ok = norm.reduce((a, r) => a + r.ok, 0), dropped = norm.reduce((a, r) => a + r.dropped, 0)
    const total = Object.values(own).reduce((a, b) => a + b, 0)
    out[kind] = {
      total, normalized: ok, dropped, pendingNormalize: total - ok - dropped,
      normByLang: Object.fromEntries(Object.entries(own).map(([L, n]) => { const r = norm.find((x) => x.lang === L); return [L, { total: n, ok: r?.ok ?? 0, dropped: r?.dropped ?? 0 }] })),
      translate: Object.fromEntries(langs.map((L) => [L, { done: translated.find((r) => r.kind === kind && r.target === L)?.n ?? 0, need: eligible.filter((r) => r.kind === kind && r.lang !== L).reduce((a, r) => a + r.n, 0) }])),
    }
  }
  return out
}

function enrich(db, entries) {
  const ids = [...new Set(entries.map((e) => e.id))].filter(Number.isInteger)
  if (!ids.length) return entries
  const rows = db.all(`SELECT c.id AS id, c.ply AS ply, c.san AS san, c.position || ' 0 1' AS fen, c.lang AS own, s.title AS source, s.kind AS kind FROM position_comments c JOIN comment_games g ON g.id=c.game_id JOIN comment_sources s ON s.id=g.source_id WHERE c.id IN (${ids.join(',')})`)
  const by = new Map(rows.map((r) => [r.id, r]))
  return entries.map((e) => ({ ...e, ...(by.get(e.id) ?? {}) }))
}

async function lastLog(path) {
  try {
    const { size, mtimeMs } = await stat(path)
    const fh = await open(path, 'r')
    const len = Math.min(size, 4096), buf = Buffer.alloc(len)
    await fh.read(buf, 0, len, size - len)
    await fh.close()
    return { line: buf.toString('utf8').trim().split('\n').at(-1) ?? '', modified: mtimeMs }
  } catch { return { line: '', modified: 0 } }
}

export default {
  routes(app, ctx) {
    let reader = null, readerPath = ''
    const samples = []
    const sample = (state) => {
      const c = state.counts, now = Date.now()
      const sum = (a, ss) => ss.reduce((n, s) => n + (c[`${a}|${s}`] ?? 0), 0)
      samples.push({ t: now, universal: sum('universal', ['accepted', 'rejected', 'dropped', 'failed']), translate: sum('translate', ['accepted', 'rejected', 'failed']) })
      while (samples.length > 1 && now - samples[0].t > 10 * 60_000) samples.shift()
    }
    const rate = (key) => {
      if (samples.length < 2) return null
      const a = samples[0], b = samples.at(-1), dt = (b.t - a.t) / 60_000
      return dt > 0.2 ? (b[key] - a[key]) / dt : null
    }
    const readerFor = (path) => { if (!reader || readerPath !== path) { reader = createReviewReader(path); readerPath = path; samples.length = 0 } return reader }
    // Sample the speed in the background too, so the estimate exists from the first minute.
    const timer = setInterval(() => { const s = ctx.settings(); if (s.reviewPath) void readerFor(s.reviewPath).read().then(sample).catch(() => {}) }, 15_000)
    timer.unref()

    app.get('/api/status', async () => {
      const s = ctx.settings()
      if (!s.dbPath) return { configured: false }
      const state = await readerFor(s.reviewPath).read()
      sample(state)
      const [{ stdout }, log, loaded] = await Promise.all([run('ps', ['-axo', 'pid,etime,args'], { maxBuffer: 16 * 1024 * 1024 }), lastLog(s.logPath), ollama.ps(s.ollamaUrl).then((l) => ({ up: true, loaded: l })).catch(() => ({ up: false, loaded: [] }))])
      const job = parseJob(stdout)
      return withDb(s.dbPath, (db) => ({
        configured: true, now: new Date().toISOString(), job, plan: ctx.plan ? ctx.plan() : DEFAULT_PLAN, driverRunning: /run-all\.sh|run-es\.sh|llm-console\/.*queue/.test(stdout), ollama: loaded,
        langs: job?.langs ?? s.langs, counts: countsOf(db, job?.langs ?? s.langs),
        recent: { universal: enrich(db, state.recent.universal.slice(-10).reverse()), translate: enrich(db, state.recent.translate.slice(-10).reverse()), problems: enrich(db, state.recent.problems.slice(-10).reverse()) },
        log: log.line, idleSeconds: log.modified ? Math.round((Date.now() - log.modified) / 1000) : null,
        review: state.counts, reviewLines: state.lines,
        rates: { universalPerMin: rate('universal'), translatePerMin: rate('translate'), windowMin: samples.length > 1 ? +((samples.at(-1).t - samples[0].t) / 60_000).toFixed(1) : 0 },
      }), { readOnly: true })
    })
  },
}
