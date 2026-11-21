// Benchmark tab: runs the real V2 prompts of a task on the same sample of comments with up to 3 models, one at a time,
// measures speed (prefill, generation) and validation, and lets an external model judge the run and improve the prompt.
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { toFigurines } from '../../../figurines.mjs'
import { TARGET_LANGS, parseAiAnswer, translatePromptV2, universalPromptV2, validateRewrite } from '../../../translate-comments.mjs'
import { getSecret as realGetSecret } from '../../lib/config.mjs'
import { withDb } from '../../lib/db.mjs'
import { complete as realComplete } from '../../lib/llm.mjs'
import * as ollama from '../../lib/ollama.mjs'

const MAX_MODELS = 3, MAX_ITEMS = 200, MAX_CHARS = 1500
const RUN_ID = /^b[a-z0-9-]+$/
const OPTIONS = { temperature: 0.2, num_ctx: 4096 }
const httpError = (status, message) => Object.assign(new Error(message), { status })

/** A small seeded generator (mulberry32), so a sample can be reproduced. */
function rng(seed) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** `n` ids out of `ids`, chosen with the seed (the same seed gives the same ids). */
export function sampleIds(ids, n, seed) {
  const pool = [...ids].sort((a, b) => a - b)
  const next = rng(seed)
  for (let i = pool.length - 1; i > 0; i--) { const j = Math.floor(next() * (i + 1)); [pool[i], pool[j]] = [pool[j], pool[i]] }
  return pool.slice(0, n)
}

const mean = (xs) => (xs.length ? +(xs.reduce((a, b) => a + b, 0) / xs.length).toFixed(2) : null)
const sum = (xs) => xs.reduce((a, b) => a + (b ?? 0), 0)
const per = (tokens, ms) => (ms > 0 ? +((tokens / ms) * 1000).toFixed(1) : null)
const moveLabel = (c) => `${c.move_number ?? Math.ceil(c.ply / 2)}${c.ply % 2 ? '.' : '...'}${c.san}`
/** Groups validation problems by their kind ("moves missing from the proposal: ♘f3" → "moves missing from the proposal"). */
const reasonOf = (p) => p.split(':')[0]

/** Reads the sample with a short read-only query: [{ id, lang, source, input }]. */
function readSample(dbPath, { task, lang, kind, sourceLang, n, seed }) {
  return withDb(dbPath, (db) => {
    const hasMoveNumber = db.all('PRAGMA table_info(position_comments)').some((c) => c.name === 'move_number')
    const where = [], params = []
    if (kind) { where.push('s.kind = ?'); params.push(kind) }
    if (sourceLang) { where.push('c.lang = ?'); params.push(sourceLang) }
    if (task === 'translate') where.push(`c.lang != ? AND u.text IS NOT NULL AND u.text != ''`), params.push(lang)
    const from = `FROM position_comments c JOIN comment_games g ON g.id = c.game_id JOIN comment_sources s ON s.id = g.source_id LEFT JOIN comment_translations u ON u.comment_id = c.id AND u.lang = c.lang ${where.length ? `WHERE ${where.join(' AND ')}` : ''}`
    const ids = db.all(`SELECT c.id ${from}`, ...params).map((r) => r.id)
    const chosen = sampleIds(ids, n, seed)
    if (!chosen.length) return []
    const rows = db.all(`SELECT c.id, c.text, c.lang, c.position, c.ply, c.san${hasMoveNumber ? ', c.move_number' : ''}, u.text AS universal FROM position_comments c LEFT JOIN comment_translations u ON u.comment_id = c.id AND u.lang = c.lang WHERE c.id IN (${chosen.map(() => '?').join(',')})`, ...chosen)
    const byId = new Map(rows.map((r) => [r.id, r]))
    return chosen.map((id) => byId.get(id)).filter(Boolean).map((c) => {
      // A translation is made from the normalized text (the sample only holds comments that have one), like the real run.
      const source = task === 'translate' ? c.universal : toFigurines(c.text, 'en')
      return { id: c.id, lang: c.lang, original: source, input: { text: source, lang: c.lang, fen: `${c.position} 0 1`, move: moveLabel(c) } }
    })
  })
}

const promptFor = (task, lang, input) => (task === 'translate' ? translatePromptV2(input, lang) : universalPromptV2(input))

/** Judge the answers the way the script does: skip → dropped, a problem → rejected, an error → failed. */
function check(original, answer, task, removal, move) {
  try {
    const parsed = parseAiAnswer(answer)
    if (parsed.skip) return { status: 'dropped', problems: [], text: '' }
    const problems = validateRewrite(original, parsed.text, { removal: task === 'translate' ? 'strict' : removal, move })
    return { status: problems.length ? 'rejected' : 'accepted', problems, text: parsed.text, ratio: +(parsed.text.length / Math.max(original.length, 1)).toFixed(2) }
  } catch (e) {
    return { status: 'failed', problems: [e.message], text: '' }
  }
}

/** Per-model totals over the items of a run. */
export function aggregate(items, key) {
  const rs = items.map((i) => i.results[key]).filter(Boolean)
  const count = (s) => rs.filter((r) => r.status === s).length
  const ms = rs.map((r) => r.metrics ?? {})
  const reasons = {}
  for (const r of rs) for (const p of r.problems ?? []) reasons[reasonOf(p)] = (reasons[reasonOf(p)] ?? 0) + 1
  const ratios = rs.filter((r) => r.ratio != null).map((r) => r.ratio)
  return {
    n: rs.length, accepted: count('accepted'), rejected: count('rejected'), dropped: count('dropped'), failed: count('failed'),
    passRate: rs.length ? +(count('accepted') / rs.length).toFixed(3) : null, reasons,
    meanWallMs: mean(ms.map((m) => m.wallMs).filter((v) => v != null)),
    meanPrefillMs: mean(ms.map((m) => m.prefillMs).filter((v) => v != null)),
    meanPromptTokens: mean(ms.map((m) => m.promptTokens).filter((v) => v != null)),
    prefillTokPerS: per(sum(ms.map((m) => m.promptTokens)), sum(ms.map((m) => m.prefillMs))),
    meanEvalMs: mean(ms.map((m) => m.evalMs).filter((v) => v != null)),
    meanOutputTokens: mean(ms.map((m) => m.outputTokens).filter((v) => v != null)),
    tokPerS: per(sum(ms.map((m) => m.outputTokens)), sum(ms.map((m) => m.evalMs))),
    meanRatio: mean(ratios),
  }
}

/** A JSON object out of a model answer (fenced or with prose around it); null when there is none. */
function parseJsonLoose(text) {
  const fenced = /```(?:json)?\s*([\s\S]*?)```/.exec(text)
  const raw = (fenced ? fenced[1] : text).trim()
  const start = raw.indexOf('{')
  if (start < 0) return null
  try { const v = JSON.parse(raw.slice(start, raw.lastIndexOf('}') + 1)); return v && typeof v === 'object' && !Array.isArray(v) ? v : null } catch { return null }
}

const clip = (s) => (s.length > MAX_CHARS ? `${s.slice(0, MAX_CHARS)}…` : s)

/**
 * The benchmark service. deps (all replaceable in tests): chat(baseUrl, req), complete(cfg, req), tags(baseUrl), getSecret(name, home).
 * ctx: { home, settings() }.
 */
export function createBench(ctx, deps = {}) {
  const d = { chat: ollama.chat, complete: realComplete, tags: ollama.tags, getSecret: realGetSecret, ...deps }
  const dir = () => join(ctx.home, 'bench')
  const fileOf = (id) => join(dir(), `${id}.json`)
  let active = null // { run, cancelled, job }

  const save = (run) => {
    mkdirSync(dir(), { recursive: true })
    const tmp = `${fileOf(run.id)}.${process.pid}.tmp`
    writeFileSync(tmp, JSON.stringify(run, null, 2))
    renameSync(tmp, fileOf(run.id))
  }
  const load = (id) => {
    if (!RUN_ID.test(id)) throw httpError(400, 'invalid run id')
    if (active?.run.id === id) return active.run
    if (!existsSync(fileOf(id))) throw httpError(404, 'run not found')
    return JSON.parse(readFileSync(fileOf(id), 'utf8'))
  }
  const finalize = (run) => {
    run.items = run.items.filter((i) => Object.keys(i.results).length)
    run.aggregates = Object.fromEntries(run.models.map((m) => [m.key, { ...aggregate(run.items, m.key), loadMs: m.loadMs ?? null }]))
  }

  /** The configured external model with its key, or an explanatory error. */
  function externalConfig(settings) {
    const e = settings.external ?? {}
    if (!e.provider || !e.model) throw httpError(400, 'No external model is set. Choose a provider and model in the Queue tab (Settings).')
    const apiKey = e.provider === 'ollama' ? '' : d.getSecret(e.provider, ctx.home)
    if (e.provider !== 'ollama' && !apiKey) throw httpError(400, `No API key is saved for ${e.provider}. Set the key in the Queue tab (Settings).`)
    return { provider: e.provider, model: e.model, baseUrl: e.provider === 'ollama' ? settings.ollamaUrl : e.baseUrl || undefined, apiKey }
  }
  const mask = (message, secret) => (secret ? String(message).split(secret).join('***') : String(message))

  async function askExternal(settings, request) {
    const cfg = externalConfig(settings)
    try { return (await d.complete(cfg, request)).text } catch (e) { throw httpError(502, `external model failed: ${mask(e.message, cfg.apiKey)}`) }
  }

  async function execute(state, settings, models, sample) {
    const { run } = state
    try {
      for (const m of models) {
        run.progress.model = m.key
        const call = (prompt) => (m.external
          ? d.complete(m.cfg, { ...prompt, json: true })
          : d.chat(settings.ollamaUrl, { model: m.model, ...prompt, json: true, options: OPTIONS }))
        if (!m.external && sample.length) {
          // Warm-up: loads the model; its time is reported as load time and is not part of the measurements.
          try {
            const r = await call(promptFor(run.task, run.lang, sample[0].input))
            m.info.loadMs = r.metrics?.loadMs ?? null
            m.info.warmMs = r.metrics?.wallMs ?? null
          } catch (e) { m.info.warmError = e.message }
        }
        for (const [i, item] of sample.entries()) {
          if (state.cancelled) break
          const started = Date.now()
          let result
          try {
            const r = await call(promptFor(run.task, run.lang, item.input))
            result = { ...check(item.original, r.text, run.task, ctx.settings().removal ?? 'moderate', item.input.move), raw: r.text, metrics: { ...r.metrics, wallMs: r.metrics?.wallMs ?? Date.now() - started } }
          } catch (e) {
            result = { status: 'failed', problems: [mask(e.message, m.cfg?.apiKey)], text: '', metrics: { wallMs: Date.now() - started } }
          }
          run.items[i].results[m.key] = result
          run.progress.done++
        }
        if (state.cancelled) break
      }
      run.status = state.cancelled ? 'cancelled' : 'done'
    } catch (e) {
      run.status = 'failed'
      run.error = e.message
    } finally {
      for (const m of run.models) Object.assign(m, m.info ?? {})
      run.finishedAt = new Date().toISOString()
      finalize(run)
      save(run)
      active = null
    }
  }

  async function start(body) {
    if (active) throw httpError(409, 'a benchmark is already running')
    const settings = ctx.settings()
    const task = body.task
    if (task !== 'normalize' && task !== 'translate') throw httpError(400, 'task must be "normalize" or "translate"')
    const lang = task === 'translate' ? body.lang : null
    if (task === 'translate' && !TARGET_LANGS.includes(lang)) throw httpError(400, `lang must be one of ${TARGET_LANGS.join(', ')}`)
    const specs = Array.isArray(body.models) ? body.models : []
    if (!specs.length || specs.length > MAX_MODELS) throw httpError(400, `choose 1 to ${MAX_MODELS} models`)
    const n = body.n === undefined ? 10 : Number(body.n)
    if (!Number.isInteger(n) || n < 1 || n > MAX_ITEMS) throw httpError(400, `n must be 1 to ${MAX_ITEMS}`)
    const seed = body.seed === undefined || body.seed === '' || body.seed === null ? Math.floor(Math.random() * 1e6) : Number(body.seed)
    if (!Number.isFinite(seed)) throw httpError(400, 'seed must be a number')
    if (body.kind && !['book', 'lichess'].includes(body.kind)) throw httpError(400, 'kind must be book or lichess')

    let installed = []
    try { installed = await d.tags(settings.ollamaUrl) } catch { /* sizes are only informative */ }
    const models = specs.map((s) => {
      if (s.external) {
        const cfg = externalConfig(settings)
        return { key: `external:${cfg.model}`, model: cfg.model, external: true, provider: cfg.provider, cfg, info: {} }
      }
      if (typeof s.model !== 'string' || !s.model) throw httpError(400, 'every model needs a name')
      const meta = installed.find((t) => t.name === s.model)
      return { key: s.model, model: s.model, external: false, sizeGb: meta?.sizeGb ?? null, params: meta?.params ?? null, quant: meta?.quant ?? null, info: {} }
    })
    if (new Set(models.map((m) => m.key)).size !== models.length) throw httpError(400, 'choose different models')

    const sample = readSample(settings.dbPath, { task, lang, kind: body.kind || null, sourceLang: body.sourceLang || null, n, seed })
    if (!sample.length) throw httpError(400, 'no comments match the filters')
    const id = `b${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`
    const run = {
      id, task, lang, kind: body.kind || null, sourceLang: body.sourceLang || null, n, seed, status: 'running', startedAt: new Date().toISOString(),
      models: models.map(({ cfg, info, ...pub }) => ({ ...pub, info })),
      items: sample.map((s) => ({ id: s.id, lang: s.lang, original: s.original, results: {} })),
      progress: { done: 0, total: sample.length * models.length, model: null },
    }
    // The model entries of the run keep their measured info in `info` until the end, then it is merged in.
    const live = models.map((m, i) => { m.info = run.models[i].info; return m })
    active = { run, cancelled: false }
    active.job = execute(active, settings, live, sample)
    return { id }
  }

  const summary = (run) => ({ id: run.id, task: run.task, lang: run.lang, kind: run.kind, n: run.n, seed: run.seed, status: run.status, startedAt: run.startedAt, finishedAt: run.finishedAt ?? null, models: run.models.map((m) => m.key), progress: run.progress, judged: !!run.judge })

  function list() {
    const runs = existsSync(dir()) ? readdirSync(dir()).filter((f) => /^b[a-z0-9-]+\.json$/.test(f)).flatMap((f) => { try { return [summary(JSON.parse(readFileSync(join(dir(), f), 'utf8')))] } catch { return [] } }) : []
    if (active) runs.push(summary(active.run))
    return runs.sort((a, b) => b.startedAt.localeCompare(a.startedAt))
  }

  function finishedRun(id) {
    const run = load(id)
    if (run.status === 'running') throw httpError(409, 'the run is still running')
    return run
  }

  async function judge(id) {
    const run = finishedRun(id)
    const settings = ctx.settings()
    externalConfig(settings)
    const labels = Object.fromEntries(run.models.map((m, i) => [`M${i + 1}`, m.key]))
    const labelOf = Object.fromEntries(Object.entries(labels).map(([l, k]) => [k, l]))
    const body = run.items.map((i) => [`### Item ${i.id}`, `Original:\n${clip(i.original)}`, ...run.models.map((m) => { const r = i.results[m.key]; return `${labelOf[m.key]} (${r?.status ?? 'no result'}):\n${clip(r?.text ?? '')}${r?.problems?.length ? `\n[validation: ${r.problems.join('; ')}]` : ''}` })].join('\n')).join('\n\n')
    const system = [
      `You evaluate the outputs of several language models on the same task: ${run.task === 'translate' ? `translate chess commentary into ${run.lang}` : 'rewrite chess commentary as universal text (no names or references to the original game, quotations kept)'}.`,
      'For every item and every model M1, M2, … give integer scores 1 to 5 for: faithfulness (no added or lost ideas), fluency, notation (chess moves preserved exactly), quotations (quotations and their authors kept; 5 when there are none to keep), and a short remark.',
      'Then give an overall ranking of the models (best first) and a short verdict.',
      'Answer with JSON only: {"items":[{"id":<item id>,"verdicts":{"M1":{"faithfulness":n,"fluency":n,"notation":n,"quotations":n,"remark":"…"}}}],"overall":{"ranking":["M1","M2"],"verdict":"…"}}',
    ].join('\n')
    const raw = await askExternal(settings, { system, user: body, json: true })
    const parsed = parseJsonLoose(raw)
    if (parsed) {
      const re = (l) => labels[l] ?? l
      if (Array.isArray(parsed.items)) for (const it of parsed.items) if (it?.verdicts) it.verdicts = Object.fromEntries(Object.entries(it.verdicts).map(([l, v]) => [re(l), v]))
      if (Array.isArray(parsed.overall?.ranking)) parsed.overall.ranking = parsed.overall.ranking.map(re)
    }
    run.judge = { at: new Date().toISOString(), model: `${settings.external.provider}/${settings.external.model}`, raw, parsed }
    save(run)
    return { judge: run.judge }
  }

  async function improvePrompt(id) {
    const run = finishedRun(id)
    const settings = ctx.settings()
    externalConfig(settings)
    const sampleInput = run.items[0] ? { text: run.items[0].original, lang: run.items[0].lang, fen: '(position)', move: '(move)' } : { text: '', lang: 'en', fen: '', move: '' }
    const current = promptFor(run.task, run.lang, sampleInput).system
    const failures = run.items.flatMap((i) => run.models.flatMap((m) => {
      const r = i.results[m.key]
      return r && r.status !== 'accepted' ? [`- item ${i.id}, ${m.key}, ${r.status}: ${(r.problems ?? []).join('; ') || 'skipped as not universal'}`] : []
    })).slice(0, 40)
    const remarks = run.judge?.parsed?.items?.flatMap((it) => Object.entries(it.verdicts ?? {}).flatMap(([k, v]) => (v?.remark ? [`- item ${it.id}, ${k}: ${v.remark}`] : []))).slice(0, 40) ?? []
    const user = [`Current system prompt:\n${current}`, `Failures observed in the benchmark:\n${failures.join('\n') || '(none)'}`, `Remarks of the judge:\n${remarks.join('\n') || '(no judge run)'}${run.judge?.parsed?.overall?.verdict ? `\nOverall verdict: ${run.judge.parsed.overall.verdict}` : ''}`].join('\n\n')
    const system = 'You improve prompts for small local language models doing chess-commentary rewriting. Given the current system prompt, the failures and the judge remarks, propose an improved system prompt that fixes the failures without losing existing rules (the answer format JSON {"text": …} must stay). Answer with the full improved prompt as plain text, then a short list of what you changed.'
    const text = await askExternal(settings, { system, user })
    run.improvedPrompt = { at: new Date().toISOString(), model: `${settings.external.provider}/${settings.external.model}`, text }
    save(run)
    return { improvedPrompt: run.improvedPrompt }
  }

  return {
    whenIdle: async () => { while (active) await active.job },
    register(app) {
      app.post('/api/bench/runs', async (c) => start(await c.body()))
      app.get('/api/bench/runs', () => ({ runs: list() }))
      app.get('/api/bench/runs/:id', (c) => load(c.params.id))
      app.post('/api/bench/runs/:id/cancel', (c) => {
        load(c.params.id)
        if (!active || active.run.id !== c.params.id) throw httpError(409, 'the run is not running')
        active.cancelled = true
        return { ok: true }
      })
      app.post('/api/bench/runs/:id/judge', (c) => judge(c.params.id))
      app.post('/api/bench/runs/:id/improve-prompt', (c) => improvePrompt(c.params.id))
    },
  }
}

export default {
  routes(app, ctx) { createBench(ctx).register(app) },
}
