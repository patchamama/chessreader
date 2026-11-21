// The queue module: task validation and persistence, the runner (fake spawner), the one-writer guard,
// pause / cool-down, model pulls and the prompts viewer. No network, no real processes.
import { EventEmitter } from 'node:events'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createApp } from '../../lib/http.mjs'
import { loadSettings, saveSettings, setSecret } from '../../lib/config.mjs'
import queue, { buildArgs, findExternal } from './index.mjs'

let home
beforeEach(() => { home = mkdtempSync(join(tmpdir(), 'llm-queue-')); saveSettings({ dbPath: join(home, 'c.sqlite') }, home) })
afterEach(() => rmSync(home, { recursive: true, force: true }))

const call = async (app, method, path, body) => {
  const req = Object.assign((async function* () { if (body) yield Buffer.from(JSON.stringify(body)) })(), { method, url: path, headers: { host: '127.0.0.1:8777', 'x-console': '1' } })
  let status = 0, out = ''
  const res = { headersSent: false, writeHead(s) { status = s; this.headersSent = true }, end(d) { out = String(d) } }
  await app.handle(req, res)
  return { status, json: out ? JSON.parse(out) : null }
}

class FakeChild extends EventEmitter {
  constructor(pid) { super(); this.pid = pid; this.signals = [] }
  kill(sig) { this.signals.push(sig); if (sig === 'SIGTERM') this.finish(null, 'SIGTERM'); return true }
  finish(code, signal = null) { this.emit('exit', code, signal) }
}

function setup(extra = {}) {
  const spawned = []
  const deps = {
    scriptsDir: '/scripts',
    spawn: (cmd, args, opts) => { const c = new FakeChild(1000 + spawned.length); spawned.push({ cmd, args, opts, child: c }); return c },
    psList: async () => '  1 /usr/bin/node something-else\n',
    ollama: { ps: async () => [{ name: 'gpt-oss:20b' }], pull: async () => {} },
    fetchImpl: async () => ({ ok: true }),
    clock: () => 0,
    ...extra,
  }
  const ctx = { home, settings: () => loadSettings(home) }
  const app = createApp()
  queue.routes(app, ctx, deps)
  return { app, ctx, spawned, deps }
}
const tick = () => new Promise((r) => setTimeout(r, 5))

describe('adding tasks', () => {
  it('validates and persists a task, with the settings languages as default', async () => {
    const { app } = setup()
    expect((await call(app, 'POST', '/api/queue', { phase: 'bogus', kind: 'book' })).status).toBe(400)
    expect((await call(app, 'POST', '/api/queue', { phase: 'translate', kind: 'x' })).status).toBe(400)
    expect((await call(app, 'POST', '/api/queue', { phase: 'translate', kind: 'book', langs: ['zz'] })).status).toBe(400)
    const r = await call(app, 'POST', '/api/queue', { phase: 'translate', kind: 'book', onlyLang: 'en' })
    expect(r.status).toBe(200)
    expect(r.json.task).toMatchObject({ phase: 'translate', kind: 'book', langs: ['es'], onlyLang: 'en', status: 'queued' })
    const saved = JSON.parse(readFileSync(join(home, 'queue.json'), 'utf8'))
    expect(saved.tasks).toHaveLength(1)
    // a second instance reads it back
    const again = setup().app
    expect((await call(again, 'GET', '/api/queue')).json.tasks).toHaveLength(1)
  })
  it('reorders queued tasks and removes one', async () => {
    const { app } = setup()
    const a = (await call(app, 'POST', '/api/queue', { phase: 'normalize', kind: 'book' })).json.task
    const b = (await call(app, 'POST', '/api/queue', { phase: 'normalize', kind: 'lichess' })).json.task
    await call(app, 'PUT', '/api/queue/order', { ids: [b.id, a.id] })
    expect((await call(app, 'GET', '/api/queue')).json.tasks.map((t) => t.id)).toEqual([b.id, a.id])
    await call(app, 'DELETE', `/api/queue/${a.id}`)
    expect((await call(app, 'GET', '/api/queue')).json.tasks.map((t) => t.id)).toEqual([b.id])
  })
  it('exposes the plan for the status tab only when there are tasks', async () => {
    const { app, ctx } = setup()
    expect(ctx.plan).toBeUndefined()
    await call(app, 'POST', '/api/queue', { phase: 'translate', kind: 'lichess', onlyLang: 'en' })
    expect(ctx.plan()).toEqual([{ phase: 'translate', kind: 'lichess', onlyLang: 'en' }])
  })
})

describe('the command line', () => {
  it('builds the local Ollama command', () => {
    const s = loadSettings(home)
    const task = { phase: 'translate', kind: 'lichess', langs: ['es'], onlyLang: 'en' }
    const { args, env } = buildArgs(task, { ...s, models: { normalize: 'a', translate: 'b' }, concurrency: 3 }, { scriptsDir: '/scripts', home })
    expect(args.slice(0, 2)).toEqual(['/scripts/translate-comments.mjs', s.dbPath])
    expect(args.join(' ')).toContain('--ollama --v2 --universal --model a --translate-model b --langs es --concurrency 3 --delay-ms 0')
    expect(args.join(' ')).toContain(`--review ${s.reviewPath} --phase translate --source-kind lichess --only-lang en`)
    expect(env.LLM_API_KEY).toBeUndefined()
    expect(args.slice(-2)).toEqual(['--removal', 'moderate'])
    expect(buildArgs(task, { ...s, models: { normalize: 'a', translate: 'b' }, removal: 'strict' }, { scriptsDir: '/scripts', home }).args.slice(-2)).toEqual(['--removal', 'strict'])
  })
  it('passes an external key through the environment, never the arguments', () => {
    setSecret('openai', 'sk-secret-123', home)
    saveSettings({ external: { provider: 'openai', model: 'gpt-x', baseUrl: '' } }, home)
    const { args, env } = buildArgs({ phase: 'normalize', kind: 'book', langs: ['es'] }, loadSettings(home), { scriptsDir: '/s', home })
    expect(args).not.toContain('--ollama')
    expect(args.join(' ')).not.toContain('sk-secret-123')
    expect(args.join(' ')).toContain('--model gpt-x --translate-model gpt-x')
    expect(args.join(' ')).toContain('--base-url https://api.openai.com/v1')
    expect(env.LLM_API_KEY).toBe('sk-secret-123')
  })
  it('refuses anthropic, which the script cannot talk to', () => {
    saveSettings({ external: { provider: 'anthropic', model: 'm', baseUrl: '' } }, home)
    expect(() => buildArgs({ phase: 'normalize', kind: 'book', langs: ['es'] }, loadSettings(home), { scriptsDir: '/s', home })).toThrow(/OpenAI/)
  })
})

describe('the runner', () => {
  it('runs the queued tasks one after another and marks them from the exit code', async () => {
    const { app, spawned } = setup()
    await call(app, 'POST', '/api/queue', { phase: 'normalize', kind: 'book' })
    await call(app, 'POST', '/api/queue', { phase: 'translate', kind: 'book' })
    expect((await call(app, 'POST', '/api/queue/start')).status).toBe(200)
    await tick()
    expect(spawned).toHaveLength(1)
    expect((await call(app, 'GET', '/api/queue')).json.tasks[0].status).toBe('running')
    spawned[0].child.finish(0)
    await tick()
    expect(spawned).toHaveLength(2)
    spawned[1].child.finish(2)
    await tick()
    const { tasks, runner } = (await call(app, 'GET', '/api/queue')).json
    expect(tasks.map((t) => t.status)).toEqual(['done', 'failed'])
    expect(tasks[1].error).toMatch(/exit code 2/)
    expect(runner.state).toBe('idle')
  })
  it('refuses to start while a translate process it did not start is running, and reports it', async () => {
    const { app, spawned } = setup({ psList: async () => ' 4242 node /x/scripts/translate-comments.mjs db --phase normalize --source-kind book\n' })
    await call(app, 'POST', '/api/queue', { phase: 'normalize', kind: 'book' })
    const r = await call(app, 'POST', '/api/queue/start')
    expect(r.status).toBe(409)
    expect(r.json.error).toMatch(/already running.*4242/s)
    expect(spawned).toHaveLength(0)
    expect((await call(app, 'GET', '/api/queue')).json.external).toMatchObject({ pid: 4242 })
  })
  it('findExternal ignores the processes the runner started', () => {
    const out = '10 node scripts/translate-comments.mjs a\n11 node scripts/translate-comments.mjs b\n'
    expect(findExternal(out, new Set([10]))).toMatchObject({ pid: 11 })
    expect(findExternal(out, new Set([10, 11]))).toBeNull()
  })
  it('stop terminates the child and puts its task back in the queue', async () => {
    const { app, spawned } = setup()
    await call(app, 'POST', '/api/queue', { phase: 'normalize', kind: 'book' })
    await call(app, 'POST', '/api/queue/start')
    await tick()
    await call(app, 'POST', '/api/queue/stop')
    await tick()
    expect(spawned[0].child.signals).toContain('SIGTERM')
    const { tasks, runner } = (await call(app, 'GET', '/api/queue')).json
    expect(tasks[0].status).toBe('queued')
    expect(runner.state).toBe('idle')
  })
  it('cancels a running task by terminating it and moving on', async () => {
    const { app, spawned } = setup()
    const t = (await call(app, 'POST', '/api/queue', { phase: 'normalize', kind: 'book' })).json.task
    await call(app, 'POST', '/api/queue', { phase: 'normalize', kind: 'lichess' })
    await call(app, 'POST', '/api/queue/start')
    await tick()
    await call(app, 'DELETE', `/api/queue/${t.id}`)
    await tick()
    expect(spawned).toHaveLength(2)
    expect((await call(app, 'GET', '/api/queue')).json.tasks.map((x) => x.status)).toEqual(['canceled', 'running'])
  })
})

describe('pause and cool-down', () => {
  it('pauses and resumes the child with SIGSTOP / SIGCONT', async () => {
    const { app, spawned } = setup()
    await call(app, 'POST', '/api/queue', { phase: 'normalize', kind: 'book' })
    await call(app, 'POST', '/api/queue/start')
    await tick()
    await call(app, 'POST', '/api/queue/pause')
    expect(spawned[0].child.signals).toEqual(['SIGSTOP'])
    let q = (await call(app, 'GET', '/api/queue')).json
    expect([q.runner.state, q.tasks[0].status]).toEqual(['paused', 'paused'])
    await call(app, 'POST', '/api/queue/resume')
    expect(spawned[0].child.signals).toEqual(['SIGSTOP', 'SIGCONT'])
    q = (await call(app, 'GET', '/api/queue')).json
    expect([q.runner.state, q.tasks[0].status]).toEqual(['running', 'running'])
  })
  it('pauses on its own every N minutes for M minutes and unloads the models when asked', async () => {
    let t = 0
    const unloaded = []
    saveSettings({ pause: { everyMin: 10, forMin: 2, unload: true } }, home)
    const { app, spawned } = setup({ clock: () => t, fetchImpl: async (url, init) => { unloaded.push([url, JSON.parse(init.body)]); return { ok: true } } })
    await call(app, 'POST', '/api/queue', { phase: 'normalize', kind: 'book' })
    await call(app, 'POST', '/api/queue/start')
    await tick()
    await call(app, 'POST', '/api/queue/tick'); expect(spawned[0].child.signals).toEqual([])
    t = 10 * 60_000
    await call(app, 'POST', '/api/queue/tick')
    expect(spawned[0].child.signals).toEqual(['SIGSTOP'])
    expect(unloaded).toEqual([['http://127.0.0.1:11434/api/generate', { model: 'gpt-oss:20b', keep_alive: 0 }]])
    t = 11 * 60_000
    await call(app, 'POST', '/api/queue/tick'); expect(spawned[0].child.signals).toEqual(['SIGSTOP'])
    t = 12 * 60_000
    await call(app, 'POST', '/api/queue/tick')
    expect(spawned[0].child.signals).toEqual(['SIGSTOP', 'SIGCONT'])
  })
})

describe('model pulls', () => {
  it('pulls in the background and reports progress', async () => {
    let finish
    const { app } = setup({ ollama: { ps: async () => [], pull: (url, model, onProgress) => { onProgress({ status: 'pulling', completed: 5, total: 10 }); return new Promise((r) => { finish = r }) } } })
    expect((await call(app, 'POST', '/api/queue/pull', { model: 'bad name; rm' })).status).toBe(400)
    expect((await call(app, 'POST', '/api/queue/pull', { model: 'qwen3:8b' })).status).toBe(200)
    expect((await call(app, 'POST', '/api/queue/pull', { model: 'other' })).status).toBe(409)
    expect((await call(app, 'GET', '/api/queue/pull')).json).toMatchObject({ model: 'qwen3:8b', completed: 5, total: 10, done: false })
    finish()
    await tick()
    expect((await call(app, 'GET', '/api/queue/pull')).json).toMatchObject({ done: true, error: null })
  })
})

describe('prompts viewer', () => {
  it('returns the real V2 prompts and the validation rules', async () => {
    const { app } = setup()
    const { json } = await call(app, 'GET', '/api/queue/prompts?lang=de')
    expect(json.normalize.system).toContain('ANY game')
    expect(json.normalize.user).toContain('Position (FEN)')
    expect(json.translate.system).toContain('German')
    expect(json.rules.length).toBeGreaterThanOrEqual(3)
  })
})
