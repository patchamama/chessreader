// A tiny router with the guards of a local console: loopback host only, and a custom
// header on every request that changes something (a web page of another origin cannot send it).
import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import { extname, join, normalize } from 'node:path'

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.svg': 'image/svg+xml' }
const MAX_BODY = 5 * 1024 * 1024

/** Whether a Host header names this machine (the DNS-rebinding guard). */
export const isLocalHost = (host) => /^(127\.0\.0\.1|localhost|\[::1\])(:\d+)?$/.test(host ?? '')

export function createApp({ publicDir } = {}) {
  const routes = []
  const app = {
    /** app.get('/api/x/:id', async (ctx) => data) — a returned value is sent as JSON; ctx.send() sends by hand. */
    get: (path, handler) => routes.push(['GET', path, handler]),
    post: (path, handler) => routes.push(['POST', path, handler]),
    put: (path, handler) => routes.push(['PUT', path, handler]),
    delete: (path, handler) => routes.push(['DELETE', path, handler]),
    routes,
    async handle(req, res) {
      const url = new URL(req.url ?? '/', 'http://localhost')
      const send = (status, data, headers = {}) => {
        const body = typeof data === 'string' || Buffer.isBuffer(data) ? data : JSON.stringify(data)
        res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...headers })
        res.end(body)
      }
      try {
        if (!isLocalHost(req.headers.host)) return send(403, { error: 'forbidden host' })
        const mutating = req.method !== 'GET' && req.method !== 'HEAD'
        if (mutating && req.headers['x-console'] !== '1') return send(403, { error: 'missing X-Console header' })
        for (const [method, pattern, handler] of routes) {
          if (method !== req.method) continue
          const params = match(pattern, url.pathname)
          if (!params) continue
          const ctx = {
            req, res, params, url, query: Object.fromEntries(url.searchParams), send,
            async body() {
              const chunks = []
              let size = 0
              for await (const c of req) { size += c.length; if (size > MAX_BODY) throw Object.assign(new Error('body too large'), { status: 413 }); chunks.push(c) }
              const text = Buffer.concat(chunks).toString('utf8')
              return text ? JSON.parse(text) : {}
            },
          }
          const out = await handler(ctx)
          if (out !== undefined && !res.headersSent) send(200, out)
          return
        }
        if (req.method === 'GET' && publicDir) return await serveStatic(publicDir, url.pathname, send)
        send(404, { error: 'not found' })
      } catch (e) {
        if (!res.headersSent) send(e?.status ?? 500, { error: String(e?.message ?? e) })
      }
    },
    listen(port, host = '127.0.0.1') {
      const server = createServer((req, res) => void app.handle(req, res))
      return new Promise((resolve, reject) => { server.once('error', reject); server.listen(port, host, () => resolve(server)) })
    },
  }
  return app
}

function match(pattern, path) {
  const a = pattern.split('/'), b = path.split('/')
  if (a.length !== b.length) return null
  const params = {}
  for (let i = 0; i < a.length; i++) {
    if (a[i].startsWith(':')) params[a[i].slice(1)] = decodeURIComponent(b[i])
    else if (a[i] !== b[i]) return null
  }
  return params
}

async function serveStatic(dir, pathname, send) {
  const rel = normalize(pathname === '/' ? '/index.html' : pathname).replace(/^(\.\.[/\\])+/, '')
  if (rel.includes('..')) return send(404, { error: 'not found' })
  try {
    const data = await readFile(join(dir, rel))
    send(200, data, { 'Content-Type': TYPES[extname(rel)] ?? 'application/octet-stream' })
  } catch {
    send(404, { error: 'not found' })
  }
}
