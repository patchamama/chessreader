// The console's core: router guards, settings and secrets, GPU parsers, provider calls and the status module (no network, temp files).
import { mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createApp, isLocalHost } from './lib/http.mjs'
import { DEFAULTS, getSecret, loadSettings, saveSettings, secretStatus, setSecret } from './lib/config.mjs'
import { parseIoreg, parseNvidia, parseProfiler, gpuInfo, resetGpuCache } from './lib/gpu.mjs'
import { chat, pull, timings } from './lib/ollama.mjs'
import { complete } from './lib/llm.mjs'
import { countsOf, createReviewReader, parseJob } from './modules/status/index.mjs'
import { buildApp } from './server.mjs'

const { DatabaseSync } = createRequire(import.meta.url)('node:sqlite')
let home
beforeEach(() => { home = mkdtempSync(join(tmpdir(), 'llm-console-')) })
afterEach(() => rmSync(home, { recursive: true, force: true }))

const call = async (app, method, path, { headers = {}, body } = {}) => {
  const chunks = []
  const req = Object.assign((async function* () { if (body) yield Buffer.from(JSON.stringify(body)) })(), { method, url: path, headers: { host: '127.0.0.1:8777', ...headers } })
  let status = 0, out = ''
  const res = { headersSent: false, writeHead(s) { status = s; this.headersSent = true }, end(d) { out = String(d); chunks.push(d) } }
  await app.handle(req, res)
  return { status, json: out ? JSON.parse(out) : null }
}

describe('router guards', () => {
  it('accepts only loopback hosts', () => {
    expect(isLocalHost('127.0.0.1:8777')).toBe(true)
    expect(isLocalHost('localhost')).toBe(true)
    expect(isLocalHost('evil.example.com')).toBe(false)
    expect(isLocalHost('127.0.0.1.evil.com')).toBe(false)
  })
  it('refuses a foreign host and a change without the console header', async () => {
    const app = createApp()
    app.get('/a', () => ({ ok: 1 }))
    app.post('/b', () => ({ ok: 2 }))
    expect((await call(app, 'GET', '/a', { headers: { host: 'evil.com' } })).status).toBe(403)
    expect((await call(app, 'POST', '/b')).status).toBe(403)
    expect((await call(app, 'POST', '/b', { headers: { 'x-console': '1' } })).json).toEqual({ ok: 2 })
    expect((await call(app, 'GET', '/a')).json).toEqual({ ok: 1 })
  })
  it('reads path params and a JSON body, and answers 404/errors as JSON', async () => {
    const app = createApp()
    app.put('/x/:id', async (c) => ({ id: c.params.id, body: await c.body() }))
    app.get('/boom', () => { throw Object.assign(new Error('nope'), { status: 400 }) })
    expect((await call(app, 'PUT', '/x/7', { headers: { 'x-console': '1' }, body: { a: 1 } })).json).toEqual({ id: '7', body: { a: 1 } })
    expect(await call(app, 'GET', '/boom')).toEqual({ status: 400, json: { error: 'nope' } })
    expect((await call(app, 'GET', '/missing')).status).toBe(404)
  })
})

describe('settings and secrets', () => {
  it('has defaults, validates changes and derives the review and log files from the database', () => {
    expect(loadSettings(home)).toMatchObject({ langs: ['es'], concurrency: 3, models: { normalize: 'gpt-oss:20b', translate: 'translategemma:27b' } })
    const s = saveSettings({ dbPath: '/data/run.sqlite', concurrency: 2, langs: ['es', 'de'] }, home)
    expect(s).toMatchObject({ concurrency: 2, langs: ['es', 'de'], reviewPath: '/data/run.review.jsonl', logPath: '/data/run.log' })
    expect(() => saveSettings({ concurrency: 0 }, home)).toThrow('invalid concurrency')
    expect(() => saveSettings({ langs: ['spanish'] }, home)).toThrow('invalid langs')
    expect(() => saveSettings({ ollamaUrl: 'file:///etc' }, home)).toThrow('invalid ollamaUrl')
    expect(loadSettings(home).concurrency).toBe(2)
  })
  it('merges nested settings without losing the rest', () => {
    saveSettings({ models: { translate: 'other:1b' } }, home)
    expect(loadSettings(home).models).toEqual({ normalize: DEFAULTS.models.normalize, translate: 'other:1b' })
  })
  it('keeps secrets in a private file and only ever reports whether they are set', () => {
    setSecret('openai', 'sk-test-123', home)
    expect(getSecret('openai', home)).toBe('sk-test-123')
    expect(secretStatus(home).openai).toBe(true)
    expect(JSON.stringify(secretStatus(home))).not.toContain('sk-test')
    expect(statSync(join(home, 'secrets.json')).mode & 0o777).toBe(0o600)
    saveSettings({ concurrency: 2 }, home)
    expect(readFileSync(join(home, 'settings.json'), 'utf8').includes('sk-test')).toBe(false)
    setSecret('openai', '', home)
    expect(secretStatus(home).openai).toBe(false)
    expect(() => setSecret('nope', 'x', home)).toThrow('unknown secret')
  })
})

describe('GPU', () => {
  it('reads the macOS profile and utilization, and NVIDIA output', () => {
    expect(parseProfiler(JSON.stringify({ SPDisplaysDataType: [{ _name: 'Apple M1 Max', sppci_model: 'Apple M1 Max', sppci_cores: '32' }] }))).toEqual({ name: 'Apple M1 Max', cores: 32 })
    expect(parseIoreg('"PerformanceStatistics" = {"Device Utilization %"=98,"Renderer Utilization %"=97}')).toBe(98)
    expect(parseIoreg('nothing')).toBeNull()
    expect(parseNvidia('NVIDIA RTX 4090, 37, 2048, 24576\n')).toEqual([{ name: 'NVIDIA RTX 4090', utilization: 37, memory: { usedGb: 2, totalGb: 24 } }])
  })
  it('combines them for macOS and degrades to nulls without a GPU tool', async () => {
    resetGpuCache()
    const exec = async (cmd) => ({ stdout: cmd === 'system_profiler' ? JSON.stringify({ SPDisplaysDataType: [{ sppci_model: 'Apple M1 Max', sppci_cores: '32' }] }) : '"Device Utilization %"=12' })
    expect(await gpuInfo({ exec, os: 'darwin' })).toMatchObject({ name: 'Apple M1 Max', cores: 32, utilization: 12 })
    resetGpuCache()
    expect(await gpuInfo({ exec: async () => { throw new Error('missing') }, os: 'linux' })).toMatchObject({ name: null, utilization: null })
  })
})

describe('Ollama and the providers', () => {
  it('turns Ollama durations into prefill and generation speeds', () => {
    expect(timings({ total_duration: 3e9, load_duration: 1e9, prompt_eval_count: 200, prompt_eval_duration: 5e8, eval_count: 100, eval_duration: 2e9 }))
      .toMatchObject({ totalMs: 3000, loadMs: 1000, promptTokens: 200, prefillMs: 500, prefillTokPerS: 400, outputTokens: 100, evalMs: 2000, tokPerS: 50 })
  })
  it('chats with timings', async () => {
    const fetchImpl = async () => ({ ok: true, json: async () => ({ message: { content: 'hola' }, eval_count: 10, eval_duration: 1e9 }) })
    const r = await chat('http://x', { model: 'm', user: 'hi' }, fetchImpl)
    expect(r.text).toBe('hola')
    expect(r.metrics.tokPerS).toBe(10)
  })
  it('reports pull progress line by line and stops on an error line', async () => {
    const lines = ['{"status":"pulling","completed":5,"total":10}\n{"status":"succ', 'ess"}\n']
    const body = (async function* () { for (const l of lines) yield new TextEncoder().encode(l) })()
    const seen = []
    await pull('http://x', 'm', (p) => seen.push(p), { fetchImpl: async () => ({ ok: true, body }) })
    expect(seen).toEqual([{ status: 'pulling', completed: 5, total: 10 }, { status: 'success', completed: 0, total: 0 }])
    const bad = (async function* () { yield new TextEncoder().encode('{"error":"no such model"}\n') })()
    await expect(pull('http://x', 'm', () => {}, { fetchImpl: async () => ({ ok: true, body: bad }) })).rejects.toThrow('no such model')
  })
  it('calls Anthropic, OpenAI and compatible endpoints with the right shape and never echoes the key', async () => {
    const seen = []
    const fetchImpl = async (url, init) => { seen.push([url, init]); return { ok: true, text: async () => JSON.stringify(url.includes('anthropic') ? { content: [{ type: 'text', text: 'A' }], usage: { input_tokens: 3, output_tokens: 4 } } : { choices: [{ message: { content: 'B' } }], usage: { prompt_tokens: 5, completion_tokens: 6 } }) } }
    expect((await complete({ provider: 'anthropic', model: 'claude-x', apiKey: 'k1' }, { system: 's', user: 'u' }, fetchImpl)).text).toBe('A')
    expect(seen[0][0]).toBe('https://api.anthropic.com/v1/messages')
    expect(seen[0][1].headers['x-api-key']).toBe('k1')
    expect((await complete({ provider: 'openai', model: 'gpt-x', apiKey: 'k2' }, { user: 'u', json: true }, fetchImpl)).text).toBe('B')
    expect(seen[1][0]).toBe('https://api.openai.com/v1/chat/completions')
    expect(JSON.parse(seen[1][1].body).response_format).toEqual({ type: 'json_object' })
    expect((await complete({ provider: 'openai-compatible', model: 'm', baseUrl: 'http://localhost:1234/v1/', apiKey: 'k3' }, { user: 'u' }, fetchImpl)).text).toBe('B')
    expect(seen[2][0]).toBe('http://localhost:1234/v1/chat/completions')
    const failing = async () => ({ ok: false, status: 401, text: async () => 'bad key' })
    await expect(complete({ provider: 'openai', model: 'm', apiKey: 'SECRET-KEY' }, { user: 'u' }, failing)).rejects.toThrow(/^401: bad key$/)
    await expect(complete({ provider: 'nope', model: 'm' }, { user: 'u' }, failing)).rejects.toThrow('unknown provider')
    await expect(complete({ provider: 'openai', model: '' }, { user: 'u' }, failing)).rejects.toThrow('no model set')
  })
})

describe('status module', () => {
  const makeDb = () => {
    const db = new DatabaseSync(':memory:')
    db.exec(`CREATE TABLE comment_sources (id INTEGER PRIMARY KEY, kind TEXT, title TEXT, author TEXT, lang TEXT, priority INTEGER);
      CREATE TABLE comment_games (id TEXT PRIMARY KEY, source_id INTEGER, white TEXT, black TEXT, label TEXT, pgn TEXT);
      CREATE TABLE position_comments (id INTEGER PRIMARY KEY, hash TEXT, position TEXT, game_id TEXT, ply INTEGER, san TEXT, lang TEXT, text TEXT, move_number INTEGER);
      CREATE TABLE comment_translations (comment_id INTEGER, lang TEXT, text TEXT, PRIMARY KEY (comment_id, lang));
      INSERT INTO comment_sources VALUES (1,'book','B',NULL,'es',1),(2,'lichess','L',NULL,'en',2);
      INSERT INTO comment_games VALUES ('g1',1,NULL,NULL,NULL,''),('g2',2,NULL,NULL,NULL,'');
      INSERT INTO position_comments (id,hash,position,game_id,ply,san,lang,text) VALUES (1,'h','p','g1',1,'e4','es','a'),(2,'h','p','g1',2,'e5','es','b'),(3,'h','p','g1',3,'Nf3','en','c'),(4,'h','p','g2',1,'d4','en','d');
      INSERT INTO comment_translations VALUES (1,'es','A'),(2,'es',''),(3,'en','C'),(3,'es','Cs'),(4,'en','D');`)
    return { all: (sql) => db.prepare(sql).all() }
  }
  it('counts normalized, dropped and translated comments per kind and language', () => {
    const c = countsOf(makeDb(), ['es'])
    expect(c.book).toMatchObject({ total: 3, normalized: 2, dropped: 1, pendingNormalize: 0 })
    expect(c.book.translate.es).toEqual({ done: 1, need: 1 })
    expect(c.lichess).toMatchObject({ total: 1, normalized: 1 })
    expect(c.lichess.translate.es).toEqual({ done: 0, need: 1 })
  })
  it('reads the running translate job from ps', () => {
    const out = '  123 01:02:03 node scripts/translate-comments.mjs /x/run.sqlite --model gpt-oss:20b --translate-model translategemma:27b --langs es --concurrency 3 --phase translate --source-kind book'
    expect(parseJob(out)).toEqual({ pid: 123, elapsed: '01:02:03', phase: 'translate', kind: 'book', onlyLang: null, model: 'gpt-oss:20b', translateModel: 'translategemma:27b', langs: ['es'], concurrency: '3' })
    expect(parseJob('  1 00:01 /bin/zsh')).toBeNull()
  })
  it('reads the review file incrementally, counting by action and status and keeping the latest', async () => {
    const file = join(home, 'r.jsonl')
    const line = (id, action, status) => `${JSON.stringify({ id, lang: 'es', action, status, model: 'm', original: 'o', proposal: status === 'accepted' ? 'p' : null, problems: [] })}\n`
    writeFileSync(file, line(1, 'universal', 'accepted') + line(2, 'translate', 'rejected') + '{"id":3')
    const reader = createReviewReader(file)
    let s = await reader.read()
    expect(s.counts).toEqual({ 'universal|accepted': 1, 'translate|rejected': 1 })
    writeFileSync(file, line(1, 'universal', 'accepted') + line(2, 'translate', 'rejected') + line(3, 'translate', 'accepted'))
    s = await reader.read()
    expect(s.counts['translate|accepted']).toBe(1)
    expect(s.recent.translate.map((e) => e.id)).toEqual([3])
    expect(s.recent.problems.map((e) => e.id)).toEqual([2])
  })
})

describe('the assembled app', () => {
  it('serves health, settings (with secrets masked) and the modules list', async () => {
    const app = await buildApp({ home })
    expect((await call(app, 'GET', '/api/health')).json).toEqual({ ok: true })
    const put = await call(app, 'PUT', '/api/settings', { headers: { 'x-console': '1' }, body: { concurrency: 4 } })
    expect(put.json.settings.concurrency).toBe(4)
    await call(app, 'PUT', '/api/secrets/anthropic', { headers: { 'x-console': '1' }, body: { value: 'sk-ant-secret' } })
    const s = await call(app, 'GET', '/api/settings')
    expect(s.json.secrets.anthropic).toBe(true)
    expect(JSON.stringify(s.json)).not.toContain('sk-ant-secret')
    expect((await call(app, 'GET', '/api/modules')).json.modules).toContain('status')
    expect((await call(app, 'PUT', '/api/settings', { headers: { 'x-console': '1' }, body: { concurrency: 99 } })).status).toBe(400)
  })
  it('says the status is not configured without a database', async () => {
    const app = await buildApp({ home })
    expect((await call(app, 'GET', '/api/status')).json).toEqual({ configured: false })
  })
})
