// The benchmark module: sampling, runs with fake models, aggregation, persistence, external judge (no network, temp files).
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync, mkdirSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createApp } from '../../lib/http.mjs'
import { createBench, sampleIds } from './index.mjs'

const { DatabaseSync } = createRequire(import.meta.url)('node:sqlite')
const MIGRATION = join(import.meta.dirname, '../../../../../../apps/api/migrations/005_position_comments.sql')

let dir, home, dbPath
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'bench-'))
  home = join(dir, 'home')
  mkdirSync(home)
  dbPath = join(dir, 'c.sqlite')
  const db = new DatabaseSync(dbPath)
  db.exec(readFileSync(MIGRATION, 'utf8'))
  db.exec(`INSERT INTO comment_sources VALUES (1,'book','B','A','en',1),(2,'lichess','L','A','de',2);
    INSERT INTO comment_games VALUES ('g1',1,'w','b','l','1. e4'),('g2',2,'w','b','l','1. d4');`)
  const ins = db.prepare('INSERT INTO position_comments (id, hash, position, game_id, ply, san, lang, text) VALUES (?,?,?,?,?,?,?,?)')
  for (let i = 1; i <= 20; i++) ins.run(i, `h${i}`, 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq -', i <= 15 ? 'g1' : 'g2', 1, 'e4', i <= 15 ? 'en' : 'de', `Comment ${i}: e4 is good.`)
  // Comments 3 and 16-20 are normalized (a translation is only ever made from the normalized text).
  const norm = db.prepare('INSERT INTO comment_translations VALUES (?, ?, ?)')
  norm.run(3, 'en', 'Universal three: e4 is good.')
  for (let i = 16; i <= 20; i++) norm.run(i, 'de', `Universal ${i}: e4 is good.`)
  db.close()
})
afterEach(() => rmSync(dir, { recursive: true, force: true }))

const metrics = (o = {}) => ({ wallMs: 100, loadMs: 0, prefillMs: 20, promptTokens: 200, outputTokens: 30, evalMs: 60, ...o })
// The fake model echoes the comment of the user prompt as {"text": …}; "bad" models drop the move.
const fakeChat = (calls) => async (_url, req) => {
  calls.push({ model: req.model, user: req.user, system: req.system })
  const m = /Comment[^\n]*:\n([\s\S]*)$/.exec(req.user)
  const text = m ? m[1] : 'x'
  if (req.model === 'boom') throw new Error('ollama 500')
  if (req.model === 'drops') return { text: JSON.stringify({ text: '', skip: true }), metrics: metrics() }
  if (req.model === 'bad') return { text: JSON.stringify({ text: 'nothing about it, but ♗h6 wins' }), metrics: metrics() }
  return { text: JSON.stringify({ text }), metrics: metrics({ loadMs: calls.length === 1 ? 900 : 0 }) }
}
const settings = (extra = {}) => ({ dbPath: join(dir, 'c.sqlite'), ollamaUrl: 'http://x', external: { provider: '', model: '', baseUrl: '' }, ...extra })

function setup({ s = settings(), complete, secrets = {}, calls = [], chat } = {}) {
  const app = createApp()
  const bench = createBench({ home, settings: () => s }, {
    chat: chat ?? fakeChat(calls), complete: complete ?? (async () => ({ text: '{}', metrics: {} })),
    tags: async () => [{ name: 'good', sizeGb: 4.1, params: '7B', quant: 'Q4_K_M' }, { name: 'bad', sizeGb: 1, params: '1B', quant: 'Q8_0' }],
    getSecret: (n) => secrets[n] ?? '',
  })
  bench.register(app)
  const call = async (method, path, body) => {
    let status = 0, out = ''
    const req = Object.assign((async function* () { if (body) yield Buffer.from(JSON.stringify(body)) })(), { method, url: path, headers: { host: '127.0.0.1:8777', 'x-console': '1' } })
    await app.handle(req, { headersSent: false, writeHead(st) { status = st; this.headersSent = true }, end(d) { out = String(d) } })
    return { status, json: out ? JSON.parse(out) : null }
  }
  return { bench, call, calls }
}

describe('sampleIds', () => {
  it('is reproducible for a seed and differs for another', () => {
    const ids = Array.from({ length: 50 }, (_, i) => i + 1)
    expect(sampleIds(ids, 10, 7)).toEqual(sampleIds(ids, 10, 7))
    expect(sampleIds(ids, 10, 7)).not.toEqual(sampleIds(ids, 10, 8))
    expect(new Set(sampleIds(ids, 10, 7)).size).toBe(10)
    expect(sampleIds([1, 2], 10, 1)).toHaveLength(2)
  })
})

describe('benchmark runs', () => {
  it('runs the same items on every model, one at a time, warming a local model first without counting it', async () => {
    const t = setup()
    const r = await t.call('POST', '/api/bench/runs', { task: 'normalize', n: 4, seed: 3, models: [{ model: 'good' }, { model: 'bad' }] })
    expect(r.status).toBe(200)
    await t.bench.whenIdle()
    const run = (await t.call('GET', `/api/bench/runs/${r.json.id}`)).json
    expect(run.status).toBe('done')
    expect(run.items).toHaveLength(4)
    expect(run.models.map((m) => m.model)).toEqual(['good', 'bad'])
    // 1 warm-up + 4 items per model, sequential: all of 'good' before 'bad'.
    expect(t.calls.map((c) => c.model)).toEqual(['good', ...Array(4).fill('good'), 'bad', ...Array(4).fill('bad')])
    expect(t.calls[0].user).toBe(t.calls[1].user)
    const good = run.aggregates.good
    expect(good).toMatchObject({ n: 4, accepted: 4, rejected: 0, dropped: 0, failed: 0, passRate: 1 })
    expect(good.loadMs).toBe(900)
    expect(good.prefillTokPerS).toBe(10000) // 200 tokens in 20 ms
    expect(good.tokPerS).toBe(500) // 30 tokens in 60 ms
    expect(good.meanWallMs).toBe(100)
    expect(good.meanRatio).toBeCloseTo(1, 1)
    expect(run.aggregates.bad).toMatchObject({ accepted: 0, rejected: 4, passRate: 0 })
    expect(Object.keys(run.aggregates.bad.reasons).join()).toMatch(/moves added/)
    expect(run.models[0]).toMatchObject({ sizeGb: 4.1, quant: 'Q4_K_M' })
    expect(run.items[0].results.good).toMatchObject({ status: 'accepted' })
    expect(run.items[0].results.good.metrics.prefillMs).toBe(20)
  })

  it('counts skip answers as dropped and errors as failed, and keeps going', async () => {
    const t = setup()
    const r = await t.call('POST', '/api/bench/runs', { task: 'normalize', n: 3, models: [{ model: 'drops' }, { model: 'boom' }] })
    await t.bench.whenIdle()
    const run = (await t.call('GET', `/api/bench/runs/${r.json.id}`)).json
    expect(run.aggregates.drops).toMatchObject({ dropped: 3, accepted: 0 })
    expect(run.aggregates.boom).toMatchObject({ failed: 3 })
    expect(run.status).toBe('done')
  })

  it('translates the universal text when it exists, skips comments already in the target language, and filters by kind', async () => {
    const t = setup({ calls: [] })
    const r = await t.call('POST', '/api/bench/runs', { task: 'translate', lang: 'en', n: 20, kind: 'lichess', models: [{ model: 'good' }] })
    await t.bench.whenIdle()
    const run = (await t.call('GET', `/api/bench/runs/${r.json.id}`)).json
    expect(run.items.length).toBe(5) // the 5 german lichess comments, none is english
    expect(run.items.every((i) => i.lang === 'de')).toBe(true)
    expect(t.calls[1].system).toContain('English')
    const r2 = await t.call('POST', '/api/bench/runs', { task: 'translate', lang: 'es', n: 20, kind: 'book', seed: 1, models: [{ model: 'good' }] })
    await t.bench.whenIdle()
    const run2 = (await t.call('GET', `/api/bench/runs/${r2.json.id}`)).json
    // Only normalized comments are sampled: the one book comment that has a universal text.
    expect(run2.items.map((i) => i.id)).toEqual([3])
    expect(run2.items[0].original).toContain('Universal three')
  })

  it('is reproducible: the same seed picks the same comments', async () => {
    const a = setup(), b = setup()
    const ids = []
    for (const t of [a, b]) {
      const r = await t.call('POST', '/api/bench/runs', { task: 'normalize', n: 5, seed: 42, models: [{ model: 'good' }] })
      await t.bench.whenIdle()
      ids.push((await t.call('GET', `/api/bench/runs/${r.json.id}`)).json.items.map((i) => i.id))
    }
    expect(ids[0]).toEqual(ids[1])
  })

  it('persists a finished run under <home>/bench and lists it', async () => {
    const t = setup()
    const r = await t.call('POST', '/api/bench/runs', { task: 'normalize', n: 2, models: [{ model: 'good' }] })
    await t.bench.whenIdle()
    expect(existsSync(join(home, 'bench', `${r.json.id}.json`))).toBe(true)
    const fresh = setup() // a new instance reads the file
    const list = (await fresh.call('GET', '/api/bench/runs')).json.runs
    expect(list.map((x) => x.id)).toContain(r.json.id)
    expect(list[0]).toMatchObject({ task: 'normalize', status: 'done' })
    expect(list[0].items).toBeUndefined()
    expect((await fresh.call('GET', `/api/bench/runs/${r.json.id}`)).json.items).toHaveLength(2)
    expect((await fresh.call('GET', '/api/bench/runs/..%2Fx')).status).toBe(400)
    expect((await fresh.call('GET', '/api/bench/runs/b-nope')).status).toBe(404)
  })

  it('validates the request and refuses a second run while one is running', async () => {
    let release
    const gate = new Promise((r) => { release = r })
    const slow = fakeChat([])
    const t = setup({ chat: async (u, r) => { await gate; return slow(u, r) } })
    expect((await t.call('POST', '/api/bench/runs', { task: 'x', models: [{ model: 'good' }] })).status).toBe(400)
    expect((await t.call('POST', '/api/bench/runs', { task: 'normalize', models: [] })).status).toBe(400)
    expect((await t.call('POST', '/api/bench/runs', { task: 'normalize', models: ['a', 'b', 'c', 'd'].map((model) => ({ model })) })).status).toBe(400)
    expect((await t.call('POST', '/api/bench/runs', { task: 'translate', lang: 'xx', models: [{ model: 'good' }] })).status).toBe(400)
    expect((await t.call('POST', '/api/bench/runs', { task: 'normalize', models: [{ external: true }] })).status).toBe(400) // no external model set
    const first = await t.call('POST', '/api/bench/runs', { task: 'normalize', n: 3, models: [{ model: 'good' }] })
    expect(first.status).toBe(200)
    const second = await t.call('POST', '/api/bench/runs', { task: 'normalize', n: 3, models: [{ model: 'good' }] })
    expect(second.status).toBe(409)
    release()
    await t.bench.whenIdle()
  })

  it('cancels a running run and keeps what was done', async () => {
    let release
    const gate = new Promise((r) => { release = r })
    let n = 0
    const app = createApp()
    const bench = createBench({ home, settings: () => settings() }, {
      chat: async () => { if (++n === 3) await gate; return { text: '{"text":"Comment: e4"}', metrics: metrics() } },
      tags: async () => [], getSecret: () => '', complete: async () => ({ text: '', metrics: {} }),
    })
    bench.register(app)
    const call = async (method, path, body) => {
      let out = ''
      const req = Object.assign((async function* () { if (body) yield Buffer.from(JSON.stringify(body)) })(), { method, url: path, headers: { host: '127.0.0.1:8777', 'x-console': '1' } })
      await app.handle(req, { headersSent: false, writeHead() { this.headersSent = true }, end(d) { out = String(d) } })
      return JSON.parse(out)
    }
    const { id } = await call('POST', '/api/bench/runs', { task: 'normalize', n: 5, models: [{ model: 'm' }] })
    await new Promise((r) => setTimeout(r, 20))
    await call('POST', `/api/bench/runs/${id}/cancel`)
    release()
    await bench.whenIdle()
    const run = await call('GET', `/api/bench/runs/${id}`)
    expect(run.status).toBe('cancelled')
    expect(run.items.length).toBeLessThan(5)
  })
})

describe('external judge', () => {
  const ext = { external: { provider: 'openai', model: 'big', baseUrl: '' } }
  const finished = async (t) => {
    const r = await t.call('POST', '/api/bench/runs', { task: 'normalize', n: 2, models: [{ model: 'good' }, { model: 'bad' }] })
    await t.bench.whenIdle()
    return r.json.id
  }

  it('explains where to set the external model when none is configured', async () => {
    const t = setup()
    const id = await finished(t)
    const r = await t.call('POST', `/api/bench/runs/${id}/judge`)
    expect(r.status).toBe(400)
    expect(r.json.error).toMatch(/Queue tab/)
    const r2 = await setup({ s: settings(ext) }).call('POST', '/api/bench/runs/b-x/judge')
    expect([400, 404]).toContain(r2.status)
    const t3 = setup({ s: settings(ext) })
    const id3 = await finished(t3)
    expect((await t3.call('POST', `/api/bench/runs/${id3}/judge`)).json.error).toMatch(/key/)
  })

  it('asks the external model, parses a fenced JSON verdict tolerantly, stores raw and parsed, and never leaks the key', async () => {
    const seen = []
    const complete = async (cfg, req) => {
      seen.push({ cfg, req })
      return { text: 'Here you go:\n```json\n{"items":[{"id":1,"verdicts":{"M1":{"faithfulness":5,"fluency":4,"notation":5,"quotations":5,"remark":"ok"},"M2":{"faithfulness":2,"fluency":3,"notation":1,"quotations":5}}}],"overall":{"ranking":["M1","M2"],"verdict":"good wins"}}\n```', metrics: {} }
    }
    const t = setup({ s: settings(ext), complete, secrets: { openai: 'sk-SECRET-123' } })
    const id = await finished(t)
    const r = await t.call('POST', `/api/bench/runs/${id}/judge`)
    expect(r.status).toBe(200)
    expect(JSON.stringify(r.json)).not.toContain('sk-SECRET-123')
    expect(seen[0].cfg).toMatchObject({ provider: 'openai', model: 'big', apiKey: 'sk-SECRET-123' })
    expect(seen[0].req.user).toContain('Comment') // the originals are sent
    const j = r.json.judge
    expect(j.raw).toContain('```json')
    expect(j.parsed.overall.verdict).toBe('good wins')
    expect(j.parsed.overall.ranking).toEqual(['good', 'bad']) // labels mapped back to model names
    expect(j.parsed.items[0].verdicts.good.faithfulness).toBe(5)
    const stored = JSON.parse(readFileSync(join(home, 'bench', `${id}.json`), 'utf8'))
    expect(stored.judge.raw).toBe(j.raw)
    expect(JSON.stringify(stored)).not.toContain('sk-SECRET-123')
  })

  it('keeps the raw text when the answer is not JSON, and masks a key echoed in an error', async () => {
    const t = setup({ s: settings(ext), complete: async () => ({ text: 'not json at all', metrics: {} }), secrets: { openai: 'sk-SECRET-123' } })
    const id = await finished(t)
    const r = await t.call('POST', `/api/bench/runs/${id}/judge`)
    expect(r.status).toBe(200)
    expect(r.json.judge.parsed).toBeNull()
    expect(r.json.judge.raw).toBe('not json at all')
    const t2 = setup({ s: settings(ext), complete: async () => { throw new Error('401 bad key sk-SECRET-123') }, secrets: { openai: 'sk-SECRET-123' } })
    const id2 = await finished(t2)
    const r2 = await t2.call('POST', `/api/bench/runs/${id2}/judge`)
    expect(r2.status).toBe(502)
    expect(JSON.stringify(r2.json)).not.toContain('sk-SECRET-123')
  })

  it('proposes an improved prompt from the failures and the judge remarks, stored but never applied', async () => {
    const seen = []
    const complete = async (_cfg, req) => { seen.push(req); return { text: 'IMPROVED PROMPT TEXT', metrics: {} } }
    const t = setup({ s: settings(ext), complete, secrets: { openai: 'k' } })
    const id = await finished(t)
    const r = await t.call('POST', `/api/bench/runs/${id}/improve-prompt`)
    expect(r.status).toBe(200)
    expect(r.json.improvedPrompt.text).toBe('IMPROVED PROMPT TEXT')
    expect(seen[0].user).toContain('moves added') // the failures
    expect(seen[0].user).toContain('editor of chess commentary') // the current prompt
    expect(JSON.parse(readFileSync(join(home, 'bench', `${id}.json`), 'utf8')).improvedPrompt.text).toBe('IMPROVED PROMPT TEXT')
  })

  it('refuses to judge a run that is not finished', async () => {
    let release
    const gate = new Promise((r) => { release = r })
    const app = createApp()
    const bench = createBench({ home, settings: () => settings(ext) }, { chat: async () => { await gate; return { text: '{"text":"e4"}', metrics: metrics() } }, tags: async () => [], getSecret: () => 'k', complete: async () => ({ text: '', metrics: {} }) })
    bench.register(app)
    const call = async (method, path, body) => {
      let status = 0, out = ''
      const req = Object.assign((async function* () { if (body) yield Buffer.from(JSON.stringify(body)) })(), { method, url: path, headers: { host: '127.0.0.1:8777', 'x-console': '1' } })
      await app.handle(req, { headersSent: false, writeHead(s) { status = s; this.headersSent = true }, end(d) { out = String(d) } })
      return { status, json: JSON.parse(out) }
    }
    const { json } = await call('POST', '/api/bench/runs', { task: 'normalize', n: 2, models: [{ model: 'm' }] })
    expect((await call('POST', `/api/bench/runs/${json.id}/judge`)).status).toBe(409)
    release()
    await bench.whenIdle()
    expect(readdirSync(join(home, 'bench')).length).toBe(1)
  })
})
