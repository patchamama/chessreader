// Accounts and keys: which services have a token or key, and a real test call for each one
// (GitHub, Lichess, OpenAI, Anthropic, an OpenAI-compatible server), with the models the AI providers offer.
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { getSecret, loadSettings, secretStatus } from '../../lib/config.mjs'

const run = promisify(execFile)
/** The token the GitHub CLI holds (`gh auth token`), or '' when it is not installed or not logged in. */
const ghCliToken = async () => { try { return (await run('gh', ['auth', 'token'], { timeout: 5000 })).stdout.trim() } catch { return '' } }

const MAX_ERROR = 300
export const SERVICES = ['github', 'lichess', 'openai', 'anthropic', 'openai-compatible']

const httpError = (status, message) => Object.assign(new Error(message), { status })
const redact = (text, token) => { let t = String(text ?? ''); if (token) t = t.split(token).join('***'); return t.slice(0, MAX_ERROR) }

async function json(fetchImpl, url, init, token) {
  let r
  try { r = await fetchImpl(url, { ...init, signal: AbortSignal.timeout(15_000) }) } catch (e) { throw httpError(502, `could not reach ${new URL(url).host}: ${redact(e.message, token)}`) }
  const text = await r.text()
  if (!r.ok) throw httpError(r.status === 401 || r.status === 403 ? 401 : 502, `${r.status}: ${redact(text, token)}`)
  try { return { body: JSON.parse(text), headers: r.headers } } catch { return { body: {}, headers: r.headers } }
}

/** GitHub: who the token is, its classic scopes, and (when the Publish tab names them) whether it can push to the repositories. */
async function testGithub(token, ctx, fetchImpl) {
  const h = { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'User-Agent': 'llm-tasks-console', 'X-GitHub-Api-Version': '2022-11-28' }
  const { body, headers } = await json(fetchImpl, 'https://api.github.com/user', { headers: h }, token)
  const detail = { user: body.login, scopes: (headers.get?.('x-oauth-scopes') ?? '').split(',').map((s) => s.trim()).filter(Boolean), repos: [] }
  const sync = ctx.settings().sync ?? {}
  for (const repo of [sync.resourcesRepo, sync.sampleRepo].filter((r) => /^[\w.-]+\/[\w.-]+$/.test(r ?? ''))) {
    try {
      const { body: b } = await json(fetchImpl, `https://api.github.com/repos/${repo}`, { headers: h }, token)
      detail.repos.push({ repo, ok: true, push: !!b.permissions?.push, private: !!b.private })
    } catch (e) { detail.repos.push({ repo, ok: false, error: e.message }) }
  }
  return detail
}

/** Lichess: the account the token belongs to and the scopes it has (study:read is the one that shows private studies). */
async function testLichess(token, _ctx, fetchImpl) {
  const { body } = await json(fetchImpl, 'https://lichess.org/api/account', { headers: { Authorization: `Bearer ${token}` } }, token)
  let scopes = []
  try {
    const r = await json(fetchImpl, 'https://lichess.org/api/token/test', { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: token }, token)
    scopes = String(r.body?.[token]?.scopes ?? '').split(',').map((s) => s.trim()).filter(Boolean)
  } catch { /* the account call already proved the token works */ }
  return { user: body.username ?? body.id, scopes, studyRead: scopes.includes('study:read') }
}

async function testOpenai(token, ctx, fetchImpl, base) {
  const root = (base || 'https://api.openai.com/v1').replace(/\/$/, '')
  const { body } = await json(fetchImpl, `${root}/models`, { headers: { Authorization: `Bearer ${token}` } }, token)
  const models = (body.data ?? []).map((m) => m.id).filter(Boolean).sort()
  return { models, chatModels: models.filter((m) => /^(gpt|o\d|chatgpt)/i.test(m)) }
}

async function testAnthropic(token, _ctx, fetchImpl) {
  const { body } = await json(fetchImpl, 'https://api.anthropic.com/v1/models?limit=100', { headers: { 'x-api-key': token, 'anthropic-version': '2023-06-01' } }, token)
  const models = (body.data ?? []).map((m) => ({ id: m.id, name: m.display_name ?? m.id })).filter((m) => m.id)
  return { models: models.map((m) => m.id), named: models }
}

/**
 * test(service, { token? }) → { ok, detail }: with the token typed in the UI, else the saved one (or the environment's).
 * Never returns or logs the token.
 */
export function createAccounts(ctx, deps = {}) {
  const fetchImpl = deps.fetch ?? fetch
  const secret = deps.getSecret ?? ((n) => getSecret(n, ctx.home))
  const ghToken = deps.ghToken ?? ghCliToken
  async function test(service, { token } = {}) {
    if (!SERVICES.includes(service)) throw httpError(400, 'unknown service')
    // GitHub: the typed token, the saved one, else the one the GitHub CLI is logged in with.
    const key = (token || '').trim() || secret(service) || (service === 'github' ? await ghToken() : '')
    if (!key) throw httpError(400, 'no token or key set for this service')
    const run = { github: testGithub, lichess: testLichess, openai: testOpenai, anthropic: testAnthropic, 'openai-compatible': testOpenai }[service]
    const base = service === 'openai-compatible' ? ctx.settings().external?.baseUrl : ''
    if (service === 'openai-compatible' && !base) throw httpError(400, 'set the base URL of the compatible server first (Queue tab or below)')
    try { return { ok: true, detail: await run(key, ctx, fetchImpl, base) } } catch (e) { throw httpError(e.status ?? 502, redact(e.message, key)) }
  }
  return { test }
}

export default {
  routes(app, ctx) {
    const svc = createAccounts(ctx)
    app.get('/api/accounts', () => ({ secrets: secretStatus(ctx.home), external: loadSettings(ctx.home).external }))
    app.post('/api/accounts/test', async (c) => {
      const b = await c.body()
      return svc.test(b.service, { token: typeof b.token === 'string' ? b.token : '' })
    })
  },
}
