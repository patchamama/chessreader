#!/usr/bin/env node
// The local console for the comment normalization / translation run.
// node server.mjs [--port 8777] [--db path/to/comments.sqlite] [--lang en|es] [--open]
import { readdirSync, existsSync, readFileSync } from 'node:fs'
import { execFile } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { createApp } from './lib/http.mjs'
import { loadSettings, saveSettings, secretStatus, setSecret } from './lib/config.mjs'
import { gpuInfo } from './lib/gpu.mjs'
import * as ollama from './lib/ollama.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))

/** The app with the core routes and every module of modules/ (each `modules/<name>/index.mjs` default-exports { routes(app, ctx) }). */
export async function buildApp({ home, modulesDir = join(HERE, 'modules'), publicDir = join(HERE, 'public') } = {}) {
  const app = createApp({ publicDir })
  const ctx = { home, settings: () => loadSettings(home), app }

  app.get('/api/health', () => ({ ok: true }))
  app.get('/api/settings', () => ({ settings: loadSettings(home), secrets: secretStatus(home) }))
  app.put('/api/settings', async (c) => ({ settings: saveSettings(await c.body(), home) }))
  app.put('/api/secrets/:name', async (c) => { setSecret(c.params.name, (await c.body()).value ?? '', home); return { secrets: secretStatus(home) } })
  app.get('/api/gpu', async () => {
    const s = loadSettings(home)
    const [gpu, loaded] = await Promise.all([gpuInfo(), ollama.ps(s.ollamaUrl).catch(() => null)])
    return { gpu, ollama: { up: loaded !== null, loaded: loaded ?? [] } }
  })
  app.get('/api/ollama/models', async () => {
    const s = loadSettings(home)
    try { return { up: true, installed: await ollama.tags(s.ollamaUrl) } } catch { return { up: false, installed: [] } }
  })

  const loaded = []
  if (existsSync(modulesDir)) {
    for (const name of readdirSync(modulesDir).sort()) {
      const file = join(modulesDir, name, 'index.mjs')
      if (!existsSync(file)) continue
      const mod = (await import(pathToFileURL(file).href)).default
      await mod.routes(app, ctx)
      loaded.push(name)
    }
  }
  app.get('/api/modules', () => ({ modules: loaded }))
  // The UI of every module (modules/<name>/ui.js), served as one script that registers their tabs.
  app.get('/api/module-scripts', (c) => {
    const js = loaded.map((n) => join(modulesDir, n, 'ui.js')).filter((f) => existsSync(f)).map((f) => `/* ${f.split('/').slice(-2).join('/')} */\n;(() => {\n${readFileSync(f, 'utf8')}\n})()`).join('\n')
    c.send(200, js, { 'Content-Type': 'text/javascript; charset=utf-8' })
  })
  return app
}

function parseArgs(argv) {
  const out = {}
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--port') out.port = Number(argv[++i])
    else if (a === '--db') out.db = argv[++i]
    else if (a === '--lang') out.lang = argv[++i]
    else if (a === '--home') out.home = argv[++i]
    else if (a === '--open') out.open = true
    else throw new Error(`unknown flag ${a}`)
  }
  return out
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = parseArgs(process.argv.slice(2))
  if (args.home) process.env.LLM_CONSOLE_HOME = args.home
  if (args.db) process.env.LLM_CONSOLE_DB = args.db
  if (args.lang) saveSettings({ language: args.lang })
  const port = args.port ?? 8777
  const app = await buildApp({ home: args.home })
  await app.listen(port)
  const url = `http://127.0.0.1:${port}`
  console.log(`LLM console on ${url}`)
  if (args.open) execFile(process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'cmd' : 'xdg-open', process.platform === 'win32' ? ['/c', 'start', url] : [url], () => {})
}
