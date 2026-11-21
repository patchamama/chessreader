// The task queue: what to run (normalize / translate x books / lichess), one task at a time through
// translate-comments.mjs, with start / stop / pause (cool-down), model downloads and the prompts viewer.
//
// Pause: SIGSTOP / SIGCONT on the child. The script keeps its place in memory, nothing is re-read, and
// requests already sent to Ollama finish by themselves; no new ones are made while it is stopped.
// (Stop-and-requeue would lose the in-flight requests; the cost is that Windows has no SIGSTOP, so pausing is refused there.)
import { execFile, spawn as nodeSpawn } from 'node:child_process'
import { closeSync, existsSync, mkdirSync, openSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import { getSecret, RECOMMENDED } from '../../lib/config.mjs'
import * as ollamaLib from '../../lib/ollama.mjs'
import { TARGET_LANGS, translatePromptV2, universalPromptV2 } from '../../../translate-comments.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const run = promisify(execFile)
const PHASES = ['normalize', 'translate']
const KINDS = ['book', 'lichess']
const MODEL_NAME = /^[\w][\w.\-:/]{0,120}$/
const err = (message, status = 400) => Object.assign(new Error(message), { status })

/** The translate process in a `ps -axo pid,args` listing that the runner did not start (null when none). */
export function findExternal(psOutput, ownPids = new Set()) {
  for (const raw of psOutput.split('\n')) {
    const line = raw.trim()
    if (!/scripts\/translate-comments\.mjs/.test(line)) continue
    const pid = Number(line.split(/\s+/)[0])
    if (!ownPids.has(pid)) return { pid, command: line.slice(line.indexOf(' ') + 1).slice(0, 240) }
  }
  return null
}

/** The command line and environment of a task. The key travels in the environment (LLM_API_KEY), never in the arguments. */
export function buildArgs(task, s, { scriptsDir, home }) {
  const ext = s.external ?? {}
  const args = [join(scriptsDir, 'translate-comments.mjs'), s.dbPath]
  const env = { ...process.env }
  delete env.LLM_API_KEY
  if (ext.provider) {
    if (ext.provider === 'anthropic') throw err('The queue talks to OpenAI-compatible APIs only: pick openai or openai-compatible, or use a local model.')
    if (!['openai', 'openai-compatible'].includes(ext.provider)) throw err(`unknown external provider ${ext.provider}`)
    if (!ext.model) throw err('The external LLM needs a model name.')
    const base = ext.baseUrl || (ext.provider === 'openai' ? 'https://api.openai.com/v1' : '')
    if (!base) throw err('The external LLM needs a base URL.')
    args.push('--v2', '--universal', '--model', ext.model, '--translate-model', ext.model, '--base-url', base)
    const key = getSecret(ext.provider, home)
    if (key) env.LLM_API_KEY = key
  } else {
    args.push('--ollama', '--v2', '--universal', '--model', task.models?.normalize ?? s.models.normalize, '--translate-model', task.models?.translate ?? s.models.translate)
  }
  args.push('--langs', (task.langs?.length ? task.langs : s.langs).join(','), '--concurrency', String(s.concurrency), '--delay-ms', '0', '--review', s.reviewPath, '--phase', task.phase, '--source-kind', task.kind)
  if (task.onlyLang) args.push('--only-lang', task.onlyLang)
  args.push('--removal', s.removal === 'strict' ? 'strict' : 'moderate')
  return { args, env }
}

/** The default spawner: the child appends its output to the log file and outlives nothing (killed with the console). */
function defaultSpawn(cmd, args, { env, logPath }) {
  let fd = 'ignore'
  if (logPath) { mkdirSync(dirname(logPath), { recursive: true }); fd = openSync(logPath, 'a') }
  const child = nodeSpawn(cmd, args, { env, stdio: ['ignore', fd, fd] })
  if (typeof fd === 'number') child.on('exit', () => { try { closeSync(fd) } catch { /* already closed */ } })
  return child
}

const defaultPs = async () => (await run('ps', ['-axo', 'pid,args'], { maxBuffer: 16 * 1024 * 1024 })).stdout

const RULES = [
  { key: 'empty', text: 'The proposal must not be empty.' },
  { key: 'length', text: 'It may not be more than 3 times longer than the original.' },
  { key: 'missing', text: 'Every move of the original must be kept.' },
  { key: 'added', text: 'No move may be added that is not in the original.' },
]
const SAMPLE = { fen: 'r1bqkb1r/pppp1ppp/2n2n2/4p3/2B1P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 4 4', move: '3...Nf6', text: 'Tarrasch said: "Develop with tempo". As I told you before, ♘g5 now threatens ♗xf7+, so Black must defend.', lang: 'en' }

export default {
  routes(app, ctx, deps = {}) {
    const {
      scriptsDir = join(HERE, '..', '..', '..'), spawn = defaultSpawn, psList = defaultPs, ollama = ollamaLib,
      fetchImpl = fetch, clock = Date.now,
    } = deps
    const file = join(ctx.home, 'queue.json')
    let tasks = []
    try { tasks = JSON.parse(readFileSync(file, 'utf8')).tasks ?? [] } catch { /* none yet */ }
    // A task left running by a previous console is not ours any more: queue it again (the script skips what is done).
    for (const t of tasks) if (t.status === 'running' || t.status === 'paused') t.status = 'queued'

    const save = () => {
      mkdirSync(dirname(file), { recursive: true })
      writeFileSync(`${file}.tmp`, JSON.stringify({ tasks }, null, 2))
      renameSync(`${file}.tmp`, file)
    }
    const find = (id) => tasks.find((t) => t.id === id)

    const runner = { state: 'idle', current: null, child: null, stopping: false, autoPause: false, pausedUntil: null, resumedAt: 0 }
    const pullState = { model: null, status: '', completed: 0, total: 0, done: true, error: null }
    const ownPids = () => new Set(runner.child?.pid ? [runner.child.pid] : [])

    // The plan the status tab shows: the tasks in order, once there are any worth showing.
    Object.defineProperty(ctx, 'plan', {
      configurable: true, enumerable: true,
      get() {
        const list = tasks.filter((t) => !['canceled', 'failed'].includes(t.status))
        return list.length ? () => tasks.filter((t) => !['canceled', 'failed'].includes(t.status)).map((t) => ({ phase: t.phase, kind: t.kind, onlyLang: t.onlyLang ?? null })) : undefined
      },
    })

    const finishTask = (task, patch) => { Object.assign(task, patch, { endedAt: new Date(clock()).toISOString() }); save() }

    function launchNext() {
      const task = tasks.find((t) => t.status === 'queued')
      if (!task || runner.stopping) { runner.state = 'idle'; runner.current = null; runner.child = null; runner.stopping = false; return }
      const s = ctx.settings()
      let built
      try { built = buildArgs(task, s, { scriptsDir, home: ctx.home }) } catch (e) { finishTask(task, { status: 'failed', error: e.message }); return launchNext() }
      let child
      try { child = spawn(process.execPath, built.args, { env: built.env, logPath: s.logPath }) } catch (e) { finishTask(task, { status: 'failed', error: e.message }); return launchNext() }
      Object.assign(task, { status: 'running', startedAt: new Date(clock()).toISOString(), endedAt: undefined, error: undefined })
      save()
      Object.assign(runner, { state: 'running', current: task.id, child, autoPause: false, pausedUntil: null, resumedAt: clock() })
      let ended = false
      const onEnd = (code, signal, message) => {
        if (ended) return
        ended = true
        if (task.status === 'running' || task.status === 'paused') {
          if (runner.stopping) { task.status = 'queued'; save() } else if (code === 0) finishTask(task, { status: 'done' })
          else finishTask(task, { status: 'failed', error: message ?? (signal ? `killed by ${signal}` : `exit code ${code}`) })
        }
        launchNext()
      }
      child.on('exit', onEnd)
      child.on('error', (e) => onEnd(null, null, e.message))
    }

    async function unloadModels(s) {
      try {
        for (const m of await ollama.ps(s.ollamaUrl)) {
          await fetchImpl(`${s.ollamaUrl}/api/generate`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ model: m.name, keep_alive: 0 }) })
        }
      } catch { /* Ollama may be down: nothing to unload */ }
    }

    async function pause({ auto = false } = {}) {
      if (runner.state !== 'running' || !runner.child) throw err('nothing is running', 409)
      if (process.platform === 'win32') throw err('pausing is not supported on Windows', 400)
      runner.child.kill('SIGSTOP')
      const s = ctx.settings()
      Object.assign(runner, { state: 'paused', autoPause: auto, pausedUntil: auto ? clock() + (s.pause?.forMin ?? 5) * 60_000 : null })
      const task = find(runner.current)
      if (task) { task.status = 'paused'; save() }
      if (auto && s.pause?.unload) await unloadModels(s)
    }
    function resume() {
      if (runner.state !== 'paused' || !runner.child) throw err('nothing is paused', 409)
      runner.child.kill('SIGCONT')
      Object.assign(runner, { state: 'running', autoPause: false, pausedUntil: null, resumedAt: clock() })
      const task = find(runner.current)
      if (task) { task.status = 'running'; save() }
    }
    /** The cool-down clock: pauses every `everyMin` minutes of work and resumes after `forMin`. */
    async function tick() {
      const s = ctx.settings(), p = s.pause ?? {}
      if (runner.state === 'running' && p.everyMin > 0 && clock() - runner.resumedAt >= p.everyMin * 60_000) await pause({ auto: true })
      else if (runner.state === 'paused' && runner.autoPause && clock() >= runner.pausedUntil) resume()
    }
    const timer = setInterval(() => void tick().catch(() => {}), 10_000)
    timer.unref?.()

    app.get('/api/queue', async () => {
      const external = findExternal(await psList().catch(() => ''), ownPids())
      const p = ctx.settings().pause ?? {}
      return {
        tasks,
        runner: { state: runner.state, current: runner.current, pid: runner.child?.pid ?? null, pausedUntil: runner.pausedUntil, nextPauseAt: runner.state === 'running' && p.everyMin > 0 ? runner.resumedAt + p.everyMin * 60_000 : null },
        external, recommended: RECOMMENDED,
      }
    })

    app.post('/api/queue', async (c) => {
      const b = await c.body()
      if (!PHASES.includes(b.phase)) throw err('phase must be normalize or translate')
      if (!KINDS.includes(b.kind)) throw err('kind must be book or lichess')
      const langs = b.langs ?? ctx.settings().langs
      if (!Array.isArray(langs) || !langs.length || !langs.every((l) => TARGET_LANGS.includes(l))) throw err(`langs must be among ${TARGET_LANGS.join(', ')}`)
      if (b.onlyLang !== undefined && b.onlyLang !== null && !TARGET_LANGS.includes(b.onlyLang)) throw err('invalid onlyLang')
      const task = { id: randomUUID().slice(0, 8), phase: b.phase, kind: b.kind, langs, ...(b.onlyLang ? { onlyLang: b.onlyLang } : {}), status: 'queued', createdAt: new Date(clock()).toISOString() }
      tasks.push(task)
      save()
      return { task }
    })

    app.delete('/api/queue/:id', (c) => {
      const task = find(c.params.id)
      if (!task) throw err('no such task', 404)
      if (task.status === 'running' || task.status === 'paused') {
        const wasPaused = task.status === 'paused'
        finishTask(task, { status: 'canceled' })
        runner.child?.kill('SIGTERM')
        if (wasPaused) runner.child?.kill('SIGCONT')
      } else {
        tasks = tasks.filter((t) => t !== task)
        save()
      }
      return { ok: true }
    })

    app.post('/api/queue/start', async () => {
      if (runner.state === 'paused') { resume(); return { state: runner.state } }
      if (runner.state === 'running') return { state: runner.state }
      const s = ctx.settings()
      if (!s.dbPath) throw err('No database is set.')
      if (!tasks.some((t) => t.status === 'queued')) throw err('There are no queued tasks.')
      const external = findExternal(await psList().catch(() => ''), ownPids())
      if (external) throw err(`A translation process is already running (pid ${external.pid}); only one process may write the database. Wait for it or stop it first.`, 409)
      runner.stopping = false
      launchNext()
      return { state: runner.state }
    })
    app.post('/api/queue/stop', () => {
      if (runner.state === 'idle') return { state: 'idle' }
      runner.stopping = true
      const wasPaused = runner.state === 'paused'
      runner.child?.kill('SIGTERM')
      if (wasPaused) runner.child?.kill('SIGCONT')
      return { state: runner.state }
    })
    app.post('/api/queue/pause', async () => { await pause(); return { state: runner.state } })
    app.post('/api/queue/resume', () => { resume(); return { state: runner.state } })
    app.post('/api/queue/tick', async () => { await tick(); return { state: runner.state } })
    app.put('/api/queue/order', async (c) => {
      const { ids } = await c.body()
      if (!Array.isArray(ids)) throw err('ids must be an array')
      const queued = tasks.filter((t) => t.status === 'queued')
      const order = ids.map((id) => queued.find((t) => t.id === id)).filter(Boolean)
      const rest = queued.filter((t) => !order.includes(t))
      const slots = [...order, ...rest]
      let i = 0
      tasks = tasks.map((t) => (t.status === 'queued' ? slots[i++] : t))
      save()
      return { tasks }
    })

    app.post('/api/queue/pull', async (c) => {
      const { model } = await c.body()
      if (typeof model !== 'string' || !MODEL_NAME.test(model)) throw err('invalid model name')
      if (!pullState.done) throw err(`already downloading ${pullState.model}`, 409)
      Object.assign(pullState, { model, status: 'starting', completed: 0, total: 0, done: false, error: null })
      const url = ctx.settings().ollamaUrl
      void Promise.resolve(ollama.pull(url, model, (p) => Object.assign(pullState, p)))
        .then(() => { pullState.status = 'success' })
        .catch((e) => { pullState.error = e.message })
        .finally(() => { pullState.done = true })
      return { ...pullState }
    })
    app.get('/api/queue/pull', () => ({ ...pullState }))

    app.get('/api/queue/prompts', (c) => {
      const lang = TARGET_LANGS.includes(c.query.lang) ? c.query.lang : 'es'
      return { sample: SAMPLE, targetLang: lang, normalize: universalPromptV2(SAMPLE), translate: translatePromptV2(SAMPLE, lang), rules: RULES }
    })
  },
}
