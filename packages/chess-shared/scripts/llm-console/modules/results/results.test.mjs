// The results module: incremental review index, filtered browsing, and redo with an external model (fakes only).
import { appendFileSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createApp } from '../../lib/http.mjs'
import { setSecret } from '../../lib/config.mjs'
import results, { createResultsIndex, destinationSquare } from './index.mjs'

const { DatabaseSync } = createRequire(import.meta.url)('node:sqlite')
const MIGRATION = readFileSync(new URL('../../../../../../apps/api/migrations/005_position_comments.sql', import.meta.url), 'utf8')

let dir, dbPath, reviewPath
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'results-'))
  dbPath = join(dir, 'run.sqlite')
  reviewPath = join(dir, 'run.review.jsonl')
  const db = new DatabaseSync(dbPath)
  db.exec(MIGRATION)
  db.exec(`ALTER TABLE position_comments ADD COLUMN move_number INTEGER;
    INSERT INTO comment_sources VALUES (1,'book','Book One',NULL,'en',1),(2,'lichess','Study Two',NULL,'en',2);
    INSERT INTO comment_games VALUES ('g1',1,NULL,NULL,NULL,''),('g2',2,NULL,NULL,NULL,'');
    INSERT INTO position_comments (id,hash,position,game_id,ply,san,lang,text) VALUES
      (1,'h','rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq -','g1',1,'e4','en','Good move e4 by Fischer.'),
      (2,'h','p','g1',2,'e5','en','Reply e5 is solid.'),
      (3,'h','p','g2',3,'Nf3','en','Develops Nf3 quickly.'),
      (4,'h','p','g2',4,'Nc6','en','Hello from the book.');
    INSERT INTO comment_translations VALUES (1,'en','Good move e4.'),(1,'es','Buena jugada e4.'),(2,'en','Reply e5 is solid.'),(4,'en','');`)
  db.close()
})
afterEach(() => rmSync(dir, { recursive: true, force: true }))

const line = (id, action, status, extra = {}) => `${JSON.stringify({ id, lang: action === 'universal' ? 'en' : 'es', action, status, model: 'm1', original: `orig ${id}`, proposal: status === 'accepted' || status === 'rejected' ? `prop ${id}` : null, problems: status === 'rejected' ? ['moves missing from the proposal: e4'] : [], ...extra })}\n`
const seed = () => writeFileSync(reviewPath,
  line(1, 'universal', 'accepted') + line(1, 'translate', 'accepted') + line(2, 'universal', 'rejected') + line(3, 'universal', 'accepted', { original: 'Develops Nf3 quickly.' }) + line(4, 'universal', 'dropped') + line(3, 'translate', 'failed'))

const call = async (app, method, path, body) => {
  const req = Object.assign((async function* () { if (body) yield Buffer.from(JSON.stringify(body)) })(), { method, url: path, headers: { host: '127.0.0.1:8777', 'x-console': '1' } })
  let status = 0, out = ''
  await app.handle(req, { headersSent: false, writeHead(s) { status = s; this.headersSent = true }, end(d) { out = String(d) } })
  return { status, json: out ? JSON.parse(out) : null, raw: out }
}

const makeApp = (opts = {}, settings = {}) => {
  const app = createApp()
  const ctx = { home: dir, app, settings: () => ({ dbPath, reviewPath, external: { provider: 'openai', model: 'big-model', baseUrl: '' }, ...settings }), redoDelayMs: 0, ...opts }
  results.routes(app, ctx)
  return app
}
const answer = (text) => async () => ({ text: JSON.stringify({ text }), metrics: {} })
const waitJob = async (app) => { for (let i = 0; i < 200; i++) { const r = (await call(app, 'GET', '/api/results/redo')).json; if (!r.job.running) return r; await new Promise((x) => setTimeout(x, 5)) } throw new Error('job did not finish') }

describe('review index', () => {
  it('reads appended lines incrementally by byte offset, ignores a partial line and resets on truncation', async () => {
    const idx = createResultsIndex(reviewPath)
    writeFileSync(reviewPath, line(1, 'universal', 'accepted') + '{"id":2')
    await idx.read()
    expect(idx.entries).toHaveLength(1)
    const before = idx.offset
    appendFileSync(reviewPath, `,"action":"translate","lang":"es","status":"failed","problems":[]}\n` + line(3, 'universal', 'accepted'))
    await idx.read()
    expect(idx.entries.map((e) => e.id)).toEqual([1, 2, 3])
    expect(idx.offset).toBeGreaterThan(before)
    expect((await idx.load(idx.entries[2])).proposal).toBe('prop 3')
    writeFileSync(reviewPath, line(9, 'universal', 'accepted'))
    await idx.read()
    expect(idx.entries.map((e) => e.id)).toEqual([9])
  })
})

describe('GET /api/results', () => {
  it('lists newest first with the source, own language and the current stored text, plus counters', async () => {
    seed()
    const r = (await call(makeApp(), 'GET', '/api/results?limit=2')).json
    expect(r.total).toBe(6)
    expect(r.rows.map((x) => [x.id, x.action])).toEqual([[3, 'translate'], [4, 'universal']])
    const full = (await call(makeApp(), 'GET', '/api/results?action=translate&status=accepted')).json.rows[0]
    expect(full).toMatchObject({ id: 1, lang: 'es', source: 'Book One', kind: 'book', ply: 1, san: 'e4', own: 'en', original: 'orig 1', proposal: 'prop 1', current: 'Buena jugada e4.' })
    expect(r.counts['universal|accepted']).toBe(2)
  })
  it('shows the current universal text from the own-language row', async () => {
    seed()
    const row = (await call(makeApp(), 'GET', '/api/results?action=universal&status=accepted&q=orig 1')).json.rows[0]
    expect(row.current).toBe('Good move e4.')
  })
  it('filters by status, kind, language and text and paginates', async () => {
    seed()
    const app = makeApp()
    expect((await call(app, 'GET', '/api/results?status=rejected')).json.rows.map((x) => x.id)).toEqual([2])
    expect((await call(app, 'GET', '/api/results?kind=lichess')).json.rows.map((x) => x.id)).toEqual([3, 4, 3])
    expect((await call(app, 'GET', '/api/results?lang=es')).json.total).toBe(2)
    expect((await call(app, 'GET', '/api/results?q=nf3')).json.rows.map((x) => x.id)).toEqual([3])
    const page2 = (await call(app, 'GET', '/api/results?offset=4&limit=10')).json
    expect(page2.rows).toHaveLength(2)
    expect((await call(app, 'GET', '/api/results?limit=100000')).json.limit).toBeLessThanOrEqual(200)
  })
  it('sees lines appended while the job writes', async () => {
    seed()
    const app = makeApp()
    expect((await call(app, 'GET', '/api/results')).json.total).toBe(6)
    appendFileSync(reviewPath, line(2, 'translate', 'accepted'))
    expect((await call(app, 'GET', '/api/results')).json.total).toBe(7)
  })
  it('answers not configured without a database or review file', async () => {
    const app = makeApp({}, { dbPath: '', reviewPath: '' })
    expect((await call(app, 'GET', '/api/results')).json).toMatchObject({ configured: false })
  })
})

describe('GET /api/results/:id', () => {
  it('returns every attempt newest first and what is stored now', async () => {
    seed()
    appendFileSync(reviewPath, line(1, 'universal', 'rejected'))
    const r = (await call(makeApp(), 'GET', '/api/results/1')).json
    expect(r.attempts.map((a) => [a.action, a.status])).toEqual([['universal', 'rejected'], ['translate', 'accepted'], ['universal', 'accepted']])
    expect(r.stored).toEqual({ en: 'Good move e4.', es: 'Buena jugada e4.' })
    expect(r.comment).toMatchObject({ id: 1, text: 'Good move e4 by Fischer.', source: 'Book One' })
  })
})

describe('redo with an external model', () => {
  const item = (id, action, lang) => ({ id, action, lang })
  it('explains where to configure the model when none or no key is set', async () => {
    const r = await call(makeApp({ complete: answer('x') }, { external: { provider: '', model: '', baseUrl: '' } }), 'POST', '/api/results/redo', { items: [item(1, 'universal', 'en')] })
    expect(r.status).toBe(400)
    expect(r.json.error).toMatch(/Queue tab/)
    const nokey = await call(makeApp({ complete: answer('x') }), 'POST', '/api/results/redo', { items: [item(1, 'universal', 'en')] })
    expect(nokey.status).toBe(400)
    expect(nokey.json.error).toMatch(/Queue tab/)
  })
  it('runs the real prompts one call at a time, stores proposals and never touches the database', async () => {
    seed()
    setSecret('openai', 'sk-TOPSECRET', dir)
    let active = 0, maxActive = 0
    const seen = []
    const complete = async (cfg, req) => {
      seen.push({ cfg, req })
      active++; maxActive = Math.max(maxActive, active)
      await new Promise((x) => setTimeout(x, 3))
      active--
      return { text: JSON.stringify({ text: req.system.includes('You translate') ? 'Buena jugada e4 otra vez.' : 'Good move e4 again.' }), metrics: {} }
    }
    const app = makeApp({ complete })
    const start = await call(app, 'POST', '/api/results/redo', { items: [item(1, 'universal', 'en'), item(1, 'translate', 'es'), item(3, 'universal', 'en')], instructions: 'Be brief.' })
    expect(start.status).toBe(200)
    const done = await waitJob(app)
    expect(maxActive).toBe(1)
    expect(seen[0].cfg).toMatchObject({ provider: 'openai', model: 'big-model', apiKey: 'sk-TOPSECRET' })
    expect(seen[0].req.system).toContain('chess commentary')
    expect(seen[0].req.system).toContain('Be brief.')
    expect(seen[1].req.user).toContain('Good move e4.')
    expect(JSON.stringify(done)).not.toContain('sk-TOPSECRET')
    expect(done.job).toMatchObject({ total: 3, done: 3, running: false })
    const file = join(dir, 'run.redo.jsonl')
    const saved = readFileSync(file, 'utf8').trim().split('\n').map((l) => JSON.parse(l))
    expect(saved).toHaveLength(3)
    expect(saved[0]).toMatchObject({ id: 1, lang: 'en', action: 'universal', previous: 'Good move e4.', proposal: 'Good move e4 again.', status: 'proposed', model: 'big-model' })
    expect(saved[0].problems).toEqual([])
    expect(saved[1]).toMatchObject({ id: 1, lang: 'es', action: 'translate', previous: 'Buena jugada e4.' })
    const db = new DatabaseSync(dbPath)
    expect(db.prepare("SELECT text FROM comment_translations WHERE comment_id=1 AND lang='es'").get().text).toBe('Buena jugada e4.')
    db.close()
  })
  it('never translates a comment that is not normalized yet, nor one dropped as not universal', async () => {
    seed()
    setSecret('openai', 'sk-TOPSECRET', dir)
    let called = 0
    const app = makeApp({ complete: async () => { called++; return { text: JSON.stringify({ text: 'x' }), metrics: {} } } })
    await call(app, 'POST', '/api/results/redo', { items: [item(3, 'translate', 'es'), item(4, 'translate', 'es')] })
    const done = await waitJob(app)
    expect(called).toBe(0)
    expect(done.job.errors.map((e) => e.error).join()).toMatch(/normalized text/)
    expect(done.proposals).toHaveLength(0)
  })
  it('records validation problems of a proposal and the truncated provider error', async () => {
    seed()
    setSecret('openai', 'sk-TOPSECRET', dir)
    let n = 0
    const complete = async () => { if (++n === 2) throw new Error(`500: sk-TOPSECRET ${'x'.repeat(2000)}`); return { text: JSON.stringify({ text: 'a rewrite that adds ♗h6' }), metrics: {} } }
    const app = makeApp({ complete })
    await call(app, 'POST', '/api/results/redo', { items: [item(1, 'universal', 'en'), item(2, 'universal', 'en')] })
    const done = await waitJob(app)
    expect(done.proposals[0].problems.join()).toMatch(/moves added/)
    expect(done.job.errors).toHaveLength(1)
    expect(done.job.errors[0].error.length).toBeLessThan(400)
    expect(JSON.stringify(done)).not.toContain('sk-TOPSECRET')
  })
  it('refuses a second job while one runs and can cancel', async () => {
    seed()
    setSecret('openai', 'k', dir)
    const complete = () => new Promise((r) => setTimeout(() => r({ text: '{"text":"Good move e4."}', metrics: {} }), 20))
    const app = makeApp({ complete })
    await call(app, 'POST', '/api/results/redo', { items: [item(1, 'universal', 'en'), item(2, 'universal', 'en'), item(3, 'universal', 'en')] })
    expect((await call(app, 'POST', '/api/results/redo', { items: [item(1, 'universal', 'en')] })).status).toBe(409)
    await call(app, 'POST', '/api/results/redo/cancel')
    const done = await waitJob(app)
    expect(done.job.cancelled).toBe(true)
    expect(done.job.done).toBeLessThan(3)
  })
  it('rejects a bad request', async () => {
    setSecret('openai', 'k', dir)
    const app = makeApp({ complete: answer('x') })
    expect((await call(app, 'POST', '/api/results/redo', { items: [] })).status).toBe(400)
    expect((await call(app, 'POST', '/api/results/redo', { items: [{ id: 1, action: 'bogus', lang: 'es' }] })).status).toBe(400)
  })
})

describe('apply and discard proposals', () => {
  const proposal = (over) => ({ id: 1, lang: 'es', action: 'translate', original: 'o', previous: 'Buena jugada e4.', proposal: 'Mejor jugada e4.', problems: [], model: 'big-model', status: 'proposed', at: 't', ...over })
  const put = (...ps) => writeFileSync(join(dir, 'run.redo.jsonl'), ps.map((p) => JSON.stringify(p)).join('\n') + '\n')
  const stored = (id, lang) => { const db = new DatabaseSync(dbPath); const r = db.prepare('SELECT text FROM comment_translations WHERE comment_id=? AND lang=?').get(id, lang); db.close(); return r?.text }
  const redoStatus = () => readFileSync(join(dir, 'run.redo.jsonl'), 'utf8').trim().split('\n').map((l) => JSON.parse(l).status)

  it('writes the text with an upsert and marks it applied', async () => {
    put(proposal(), proposal({ id: 3, lang: 'es', proposal: 'Desarrolla Cf3.', previous: null }))
    const app = makeApp()
    const r = await call(app, 'POST', '/api/results/redo/apply', { ids: [1, 3] })
    expect(r.json.applied).toBe(2)
    expect(stored(1, 'es')).toBe('Mejor jugada e4.')
    expect(stored(3, 'es')).toBe('Desarrolla Cf3.')
    expect(redoStatus()).toEqual(['applied', 'applied'])
  })
  it('refuses proposals with problems unless forced, changing nothing', async () => {
    put(proposal(), proposal({ id: 2, lang: 'es', problems: ['moves missing from the proposal: e5'], proposal: 'Mala.' }))
    const app = makeApp()
    const r = await call(app, 'POST', '/api/results/redo/apply', { ids: ['1:es', '2:es'] })
    expect(r.status).toBe(400)
    expect(r.json.error).toMatch(/force/)
    expect(stored(1, 'es')).toBe('Buena jugada e4.')
    expect(redoStatus()).toEqual(['proposed', 'proposed'])
    expect((await call(app, 'POST', '/api/results/redo/apply', { ids: ['2:es'], force: true })).json.applied).toBe(1)
    expect(stored(2, 'es')).toBe('Mala.')
  })
  it('stores an empty text for a universal proposal that drops the comment, and can discard', async () => {
    put(proposal({ id: 2, lang: 'en', action: 'universal', proposal: '' }), proposal())
    const app = makeApp()
    expect((await call(app, 'POST', '/api/results/redo/discard', { ids: [1] })).json.discarded).toBe(1)
    expect(redoStatus()).toEqual(['proposed', 'discarded'])
    await call(app, 'POST', '/api/results/redo/apply', { ids: ['2:en'] })
    expect(stored(2, 'en')).toBe('')
    expect(stored(1, 'es')).toBe('Buena jugada e4.')
  })
  it('errors when nothing matches', async () => {
    put(proposal())
    expect((await call(makeApp(), 'POST', '/api/results/redo/apply', { ids: [99] })).status).toBe(404)
  })
})

describe('review of one translation: edit, revoke, local redo', () => {
  const stored = (id, lang) => { const db = new DatabaseSync(dbPath); const r = db.prepare('SELECT text FROM comment_translations WHERE comment_id=? AND lang=?').get(id, lang); db.close(); return r?.text }
  const redoLog = () => { const f = join(dir, 'run.redo.jsonl'); return existsSync(f) ? readFileSync(f, 'utf8').trim().split('\n').map((l) => JSON.parse(l)) : [] }

  it('edits a stored translation and logs the previous text', async () => {
    const app = makeApp()
    const r = await call(app, 'PUT', '/api/results/translations/1/es', { text: '  Buena jugada e4, mejorada.  ' })
    expect(r.status).toBe(200)
    expect(stored(1, 'es')).toBe('Buena jugada e4, mejorada.')
    expect(redoLog()[0]).toMatchObject({ id: 1, lang: 'es', action: 'translate', previous: 'Buena jugada e4.', proposal: 'Buena jugada e4, mejorada.', status: 'edited' })
  })
  it('validates the input of an edit', async () => {
    const app = makeApp()
    expect((await call(app, 'PUT', '/api/results/translations/1/es', { text: '   ' })).status).toBe(400)
    expect((await call(app, 'PUT', '/api/results/translations/1/espanol', { text: 'x' })).status).toBe(400)
    expect((await call(app, 'PUT', '/api/results/translations/abc/es', { text: 'x' })).status).toBe(400)
    expect((await call(app, 'PUT', '/api/results/translations/1/en', { text: 'x' })).status).toBe(400)
    expect((await call(app, 'PUT', '/api/results/translations/99/es', { text: 'x' })).status).toBe(404)
    expect(stored(1, 'es')).toBe('Buena jugada e4.')
  })
  it('revokes a translation, keeping its text in the redo file, and refuses the own language', async () => {
    const app = makeApp()
    expect((await call(app, 'DELETE', '/api/results/translations/1/es')).status).toBe(200)
    expect(stored(1, 'es')).toBeUndefined()
    expect(stored(1, 'en')).toBe('Good move e4.')
    expect(redoLog()[0]).toMatchObject({ id: 1, lang: 'es', previous: 'Buena jugada e4.', status: 'revoked' })
    expect((await call(app, 'DELETE', '/api/results/translations/1/es')).status).toBe(404)
    expect((await call(app, 'DELETE', '/api/results/translations/1/en')).status).toBe(400)
  })
  it('redoes with a local model through chat, with no key and no database write', async () => {
    seed()
    const calls = []
    const chat = async (url, req) => { calls.push({ url, req }); return { text: JSON.stringify({ text: 'Buena jugada e4 local.' }), metrics: {} } }
    const never = async () => { throw new Error('external must not be called') }
    const app = makeApp({ chat, complete: never }, { ollamaUrl: 'http://127.0.0.1:1', external: { provider: '', model: '', baseUrl: '' } })
    expect((await call(app, 'POST', '/api/results/redo', { items: [{ id: 1, action: 'translate', lang: 'es' }], via: 'local' })).status).toBe(400)
    const r = await call(app, 'POST', '/api/results/redo', { items: [{ id: 1, action: 'translate', lang: 'es' }], via: 'local', model: 'gemma:7b' })
    expect(r.status).toBe(200)
    const done = await waitJob(app)
    expect(calls[0].url).toBe('http://127.0.0.1:1')
    expect(calls[0].req).toMatchObject({ model: 'gemma:7b', json: true })
    expect(calls[0].req.system).toContain('You translate')
    expect(done.proposals[0]).toMatchObject({ id: 1, lang: 'es', proposal: 'Buena jugada e4 local.', model: 'gemma:7b', status: 'proposed' })
    expect(stored(1, 'es')).toBe('Buena jugada e4.')
  })
  it('rejects an unknown via', async () => {
    expect((await call(makeApp({ complete: answer('x') }), 'POST', '/api/results/redo', { items: [{ id: 1, action: 'translate', lang: 'es' }], via: 'carrier-pigeon' })).status).toBe(400)
  })
})

describe('lazy loading contract and position data', () => {
  it('rows and the comment carry fen, ply, san and the destination square', async () => {
    seed()
    const app = makeApp()
    const row = (await call(app, 'GET', '/api/results?action=universal&status=accepted&q=orig 1')).json.rows[0]
    expect(row).toMatchObject({ fen: 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1', ply: 1, san: 'e4', mark: 'e4' })
    expect((await call(app, 'GET', '/api/results/1')).json.comment.fen).toBe(row.fen)
  })
  it('reads the destination square of a SAN', () => {
    expect([destinationSquare('e4'), destinationSquare('Nxf3+'), destinationSquare('exd5'), destinationSquare('e8=Q#'), destinationSquare('O-O'), destinationSquare(''), destinationSquare(null)])
      .toEqual(['e4', 'f3', 'd5', 'e8', null, null, null])
  })
  it('pages stay stable while attempts are appended: a cursor excludes the newer lines', async () => {
    seed()
    const app = makeApp()
    const p1 = (await call(app, 'GET', '/api/results?limit=2')).json
    expect(p1.rows.map((r) => r.seq)).toEqual([5, 4])
    appendFileSync(reviewPath, line(2, 'translate', 'accepted') + line(1, 'universal', 'failed'))
    const p2 = (await call(app, 'GET', `/api/results?limit=2&offset=2&before=${p1.before}`)).json
    expect(p2.rows.map((r) => r.seq)).toEqual([3, 2])
    expect(p2.total).toBe(p1.total)
    const fresh = (await call(app, 'GET', '/api/results?limit=2')).json
    expect(fresh.rows.map((r) => r.seq)).toEqual([7, 6])
    expect(fresh.total).toBe(p1.total + 2)
    const all = [...p1.rows, ...p2.rows, ...(await call(app, 'GET', `/api/results?limit=10&offset=4&before=${p1.before}`)).json.rows].map((r) => r.seq)
    expect(new Set(all).size).toBe(all.length)
  })
})
