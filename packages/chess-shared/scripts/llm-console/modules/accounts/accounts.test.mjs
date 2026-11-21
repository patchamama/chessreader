// The account tests with a fake fetch: no network and no real token.
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createAccounts } from './index.mjs'
import { saveSettings, loadSettings, setSecret, secretStatus } from '../../lib/config.mjs'
import { buildApp } from '../../server.mjs'

let home
beforeEach(() => { home = mkdtempSync(join(tmpdir(), 'accounts-')) })
afterEach(() => rmSync(home, { recursive: true, force: true }))

const res = (body, { status = 200, headers = {} } = {}) => ({ ok: status < 400, status, text: async () => (typeof body === 'string' ? body : JSON.stringify(body)), headers: { get: (k) => headers[k.toLowerCase()] ?? null } })
const make = (routes, secrets = {}, ghToken = async () => '') => {
  const calls = []
  const fetch = async (url, init) => { calls.push({ url, init }); const f = routes.find(([m]) => (typeof m === 'string' ? url.startsWith(m) : m.test(url))); if (!f) throw new Error(`unexpected ${url}`); return typeof f[1] === 'function' ? f[1](url, init) : f[1] }
  const ctx = { home, settings: () => loadSettings(home) }
  return { svc: createAccounts(ctx, { fetch, getSecret: (n) => secrets[n] ?? '', ghToken }), calls }
}

describe('GitHub', () => {
  it('names the user and scopes and checks push access to the repositories of the Publish tab', async () => {
    saveSettings({ sync: { resourcesRepo: 'me/resources', sampleRepo: 'me/sample' } }, home)
    const { svc, calls } = make([
      ['https://api.github.com/user', res({ login: 'octo' }, { headers: { 'x-oauth-scopes': 'repo, read:org' } })],
      ['https://api.github.com/repos/me/resources', res({ private: true, permissions: { push: true } })],
      ['https://api.github.com/repos/me/sample', res({ message: 'Not Found' }, { status: 404 })],
    ], { github: 'ghp_SAVED' })
    const r = await svc.test('github')
    expect(r.detail).toMatchObject({ user: 'octo', scopes: ['repo', 'read:org'] })
    expect(r.detail.repos).toEqual([{ repo: 'me/resources', ok: true, push: true, private: true }, expect.objectContaining({ repo: 'me/sample', ok: false })])
    expect(calls[0].init.headers.Authorization).toBe('Bearer ghp_SAVED')
    expect(JSON.stringify(r)).not.toContain('ghp_SAVED')
  })
  it('uses the token typed in the UI before the saved one, and reports a bad token without echoing it', async () => {
    const { svc, calls } = make([['https://api.github.com/user', res('{"message":"Bad credentials ghp_TYPED"}', { status: 401 })]], { github: 'ghp_SAVED' })
    await expect(svc.test('github', { token: 'ghp_TYPED' })).rejects.toThrow(/401: .*Bad credentials \*\*\*/)
    expect(calls[0].init.headers.Authorization).toBe('Bearer ghp_TYPED')
  })
})

describe('GitHub CLI fallback', () => {
  it('uses the token of `gh auth token` when none is typed or saved, but never before them', async () => {
    const routes = [['https://api.github.com/user', res({ login: 'cli-user' })]]
    const cli = make(routes, {}, async () => 'gho_FROM_CLI')
    expect((await cli.svc.test('github')).detail.user).toBe('cli-user')
    expect(cli.calls[0].init.headers.Authorization).toBe('Bearer gho_FROM_CLI')
    const saved = make(routes, { github: 'ghp_SAVED' }, async () => 'gho_FROM_CLI')
    await saved.svc.test('github')
    expect(saved.calls[0].init.headers.Authorization).toBe('Bearer ghp_SAVED')
    await expect(make(routes).svc.test('github')).rejects.toThrow(/no token or key/)
  })
})

describe('Lichess', () => {
  it('names the account and whether the token can read studies', async () => {
    const { svc, calls } = make([
      ['https://lichess.org/api/account', res({ username: 'Magnus' })],
      ['https://lichess.org/api/token/test', (_u, init) => res({ [init.body]: { scopes: 'study:read,preference:read', userId: 'magnus' } })],
    ], { lichess: 'lip_TOKEN' })
    const r = await svc.test('lichess')
    expect(r.detail).toEqual({ user: 'Magnus', scopes: ['study:read', 'preference:read'], studyRead: true })
    expect(calls[0].init.headers.Authorization).toBe('Bearer lip_TOKEN')
  })
  it('still works when only the scopes call fails', async () => {
    const { svc } = make([['https://lichess.org/api/account', res({ id: 'x', username: 'X' })], ['https://lichess.org/api/token/test', res('nope', { status: 500 })]], { lichess: 't' })
    expect((await svc.test('lichess')).detail).toMatchObject({ user: 'X', scopes: [], studyRead: false })
  })
})

describe('OpenAI and Anthropic', () => {
  it('lists the OpenAI models (the chat ones apart)', async () => {
    const { svc } = make([['https://api.openai.com/v1/models', res({ data: [{ id: 'text-embedding-3' }, { id: 'gpt-4o' }, { id: 'o3' }] })]], { openai: 'sk-x' })
    expect((await svc.test('openai')).detail).toEqual({ models: ['gpt-4o', 'o3', 'text-embedding-3'], chatModels: ['gpt-4o', 'o3'] })
  })
  it('lists the Anthropic models with the key in the right header', async () => {
    const { svc, calls } = make([['https://api.anthropic.com/v1/models', res({ data: [{ id: 'claude-opus-5-5', display_name: 'Claude Opus 5.5' }] })]], { anthropic: 'sk-ant-1' })
    const r = await svc.test('anthropic')
    expect(r.detail.named).toEqual([{ id: 'claude-opus-5-5', name: 'Claude Opus 5.5' }])
    expect(calls[0].init.headers['x-api-key']).toBe('sk-ant-1')
    expect(calls[0].init.headers['anthropic-version']).toBe('2023-06-01')
  })
  it('tests a compatible server at its base URL and asks for one when missing', async () => {
    const { svc } = make([['http://localhost:1234/v1/models', res({ data: [{ id: 'local-model' }] })]], { 'openai-compatible': 'k' })
    await expect(svc.test('openai-compatible')).rejects.toThrow(/base URL/)
    saveSettings({ external: { provider: 'openai-compatible', model: '', baseUrl: 'http://localhost:1234/v1/' } }, home)
    expect((await svc.test('openai-compatible')).detail.models).toEqual(['local-model'])
  })
  it('reports an unreachable provider, a missing key and an unknown service', async () => {
    const { svc } = make([['https://api.openai.com', () => { throw new Error('ECONNREFUSED') }]], { openai: 'sk-x' })
    await expect(svc.test('openai')).rejects.toThrow(/could not reach api.openai.com/)
    await expect(svc.test('anthropic')).rejects.toThrow(/no token or key/)
    await expect(svc.test('nope')).rejects.toThrow(/unknown service/)
  })
})

describe('routes', () => {
  it('serves the status without values and refuses a test with nothing to test', async () => {
    setSecret('lichess', 'lip_X', home)
    expect(secretStatus(home).lichess).toBe(true)
    const app = await buildApp({ home })
    const call = async (method, path, body) => {
      let status = 0, out = ''
      const req = Object.assign((async function* () { if (body) yield Buffer.from(JSON.stringify(body)) })(), { method, url: path, headers: { host: '127.0.0.1:8777', 'x-console': '1' } })
      await app.handle(req, { headersSent: false, writeHead(s) { status = s; this.headersSent = true }, end(d) { out = String(d) } })
      return { status, json: JSON.parse(out) }
    }
    const a = await call('GET', '/api/accounts')
    expect(a.json.secrets).toMatchObject({ lichess: true })
    expect(JSON.stringify(a.json)).not.toContain('lip_X')
    expect((await call('POST', '/api/accounts/test', { service: 'openai' })).status).toBe(400)
  })
})
