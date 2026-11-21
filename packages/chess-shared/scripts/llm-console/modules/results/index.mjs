// The results of the LLM run: browse the review file joined with the database, and redo items with an external model.
import { existsSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { open, stat } from 'node:fs/promises'
import { toFigurines } from '../../../figurines.mjs'
import { parseAiAnswer, translatePromptV2, universalPromptV2, validateRewrite } from '../../../translate-comments.mjs'
import { openDb, withDb } from '../../lib/db.mjs'
import { getSecret } from '../../lib/config.mjs'
import { complete as defaultComplete } from '../../lib/llm.mjs'
import { chat as defaultChat } from '../../lib/ollama.mjs'

const MAX_LIMIT = 200
const DEFAULT_LIMIT = 25
const ERROR_MAX = 300
const httpError = (status, message) => Object.assign(new Error(message), { status })

/**
 * An incremental index of the review file (JSON lines the translate script appends): per line the byte offset,
 * length and the fields needed to filter; the full line is read back by offset only for the rows shown.
 */
export function createResultsIndex(path) {
  const idx = {
    path, offset: 0, entries: [], counts: {}, chain: Promise.resolve(),
    reset() { idx.offset = 0; idx.entries = []; idx.counts = {} },
    /** Reads what was appended since the last call (a trailing partial line waits for its newline). */
    read() {
      idx.chain = idx.chain.then(() => idx.readNow(), () => idx.readNow())
      return idx.chain
    },
    async readNow() {
      let size
      try { size = (await stat(path)).size } catch { idx.reset(); return idx }
      if (size < idx.offset) idx.reset()
      if (size === idx.offset) return idx
      const fh = await open(path, 'r')
      try {
        const buf = Buffer.alloc(size - idx.offset)
        await fh.read(buf, 0, buf.length, idx.offset)
        let start = 0
        for (let nl = buf.indexOf(10, start); nl !== -1; nl = buf.indexOf(10, start)) {
          const raw = buf.subarray(start, nl)
          if (raw.length) {
            try {
              const d = JSON.parse(raw.toString('utf8'))
              const e = {
                seq: idx.entries.length, id: d.id, lang: d.lang, action: d.action, status: d.status, model: d.model ?? '',
                off: idx.offset + start, len: raw.length,
                hay: `${d.original ?? ''}\n${d.proposal ?? ''}\n${(d.problems ?? []).join(' ')}`.toLowerCase(),
              }
              idx.entries.push(e)
              const key = `${d.action}|${d.status}`
              idx.counts[key] = (idx.counts[key] ?? 0) + 1
            } catch { /* a damaged line is skipped */ }
          }
          start = nl + 1
        }
        idx.offset += start
      } finally { await fh.close() }
      return idx
    },
    /** The full line of an entry. */
    async load(e) {
      const fh = await open(path, 'r')
      try {
        const buf = Buffer.alloc(e.len)
        await fh.read(buf, 0, e.len, e.off)
        return JSON.parse(buf.toString('utf8'))
      } finally { await fh.close() }
    },
  }
  return idx
}

const chunks = (list, n) => Array.from({ length: Math.ceil(list.length / n) }, (_, i) => list.slice(i * n, i * n + n))
const redoPathOf = (dbPath) => `${dbPath.replace(/\.sqlite3?$/, '')}.redo.jsonl`
const keyOf = (e) => `${e.id}:${e.lang}`

/** The redo file: one proposal per (comment, language); a newer one replaces the older line. */
function readRedo(file) {
  if (!existsSync(file)) return []
  const byKey = new Map()
  for (const l of readFileSync(file, 'utf8').split('\n')) {
    if (!l) continue
    try { const e = JSON.parse(l); byKey.set(keyOf(e), e) } catch { /* skip */ }
  }
  return [...byKey.values()]
}
function writeRedo(file, entries) {
  const tmp = `${file}.${process.pid}.tmp`
  writeFileSync(tmp, entries.map((e) => JSON.stringify(e)).join('\n') + (entries.length ? '\n' : ''))
  renameSync(tmp, file)
}

/** The square a SAN move lands on ("Nxf3+" -> "f3"); null for castling or when it cannot be read. */
export function destinationSquare(san) {
  const m = /([a-h][1-8])(?:=?[QRBNqrbn])?[+#]?[!?]*$/.exec(String(san ?? ''))
  return m ? m[1] : null
}
const fenOf = (position) => (position ? `${position} 0 1` : null)

const moveLabel = (c) => `${c.move_number ?? Math.ceil(c.ply / 2)}${c.ply % 2 ? '.' : '...'}${c.san}`

const COMMENT_SQL = `SELECT c.id AS id, c.text AS text, c.lang AS own, c.position AS position, c.ply AS ply, c.san AS san, s.title AS source, s.kind AS kind
  FROM position_comments c JOIN comment_games g ON g.id=c.game_id JOIN comment_sources s ON s.id=g.source_id`

export default {
  routes(app, ctx) {
    const completeFn = () => ctx.complete ?? defaultComplete
    const chatFn = () => ctx.chat ?? defaultChat
    let index = null
    const indexFor = (path) => { if (!index || index.path !== path) index = createResultsIndex(path); return index }
    const settings = () => ctx.settings()
    const configured = (s) => !!(s.dbPath && s.reviewPath)

    /** Ids (of `ids`) whose source has this kind. */
    const idsOfKind = (db, ids, kind) => {
      const keep = new Set()
      for (const part of chunks(ids, 500)) {
        for (const r of db.all(`SELECT c.id AS id FROM position_comments c JOIN comment_games g ON g.id=c.game_id JOIN comment_sources s ON s.id=g.source_id WHERE s.kind = ? AND c.id IN (${part.join(',')})`, kind)) keep.add(r.id)
      }
      return keep
    }
    const infoOf = (db, ids) => {
      const info = new Map(), stored = new Map()
      for (const part of chunks([...new Set(ids)].filter(Number.isInteger), 500)) {
        const list = part.join(',')
        for (const r of db.all(`${COMMENT_SQL} WHERE c.id IN (${list})`)) info.set(r.id, r)
        for (const r of db.all(`SELECT comment_id, lang, text FROM comment_translations WHERE comment_id IN (${list})`)) stored.set(`${r.comment_id}:${r.lang}`, r.text)
      }
      return { info, stored }
    }

    app.get('/api/results', async (c) => {
      const s = settings()
      if (!configured(s)) return { configured: false }
      const q = c.query
      const limit = Math.min(MAX_LIMIT, Math.max(1, Number.parseInt(q.limit ?? '', 10) || DEFAULT_LIMIT))
      const offset = Math.max(0, Number.parseInt(q.offset ?? '', 10) || 0)
      const idx = await indexFor(s.reviewPath).read()
      const needle = (q.q ?? '').trim().toLowerCase()
      // `before` is a cursor: only lines older than it, so pages stay stable while the job appends new ones.
      const before = Number.isInteger(Number(q.before)) && q.before !== undefined && q.before !== '' ? Math.min(Number(q.before), idx.entries.length) : idx.entries.length
      let list = idx.entries.filter((e) => e.seq < before && (!q.action || e.action === q.action) && (!q.status || e.status === q.status) && (!q.lang || e.lang === q.lang) && (!needle || e.hay.includes(needle)))
      const db = openDb(s.dbPath, { readOnly: true })
      try {
        if (q.kind) {
          const keep = idsOfKind(db, [...new Set(list.map((e) => e.id))].filter(Number.isInteger), q.kind)
          list = list.filter((e) => keep.has(e.id))
        }
        list.sort((a, b) => b.seq - a.seq)
        const page = list.slice(offset, offset + limit)
        {
          const lines = await Promise.all(page.map((e) => idx.load(e)))
          const { info, stored } = infoOf(db, page.map((e) => e.id))
          const redo = new Map(readRedo(redoPathOf(s.dbPath)).map((e) => [keyOf(e), e]))
          const rows = page.map((e, i) => {
            const d = lines[i], row = info.get(e.id)
            return {
              seq: e.seq, id: e.id, lang: e.lang, action: e.action, status: e.status, model: e.model,
              original: d.original ?? '', proposal: d.proposal ?? null, problems: d.problems ?? [],
              source: row?.source ?? null, kind: row?.kind ?? null, ply: row?.ply ?? null, san: row?.san ?? null, fen: fenOf(row?.position), mark: destinationSquare(row?.san), own: row?.own ?? null,
              current: stored.get(`${e.id}:${e.lang}`) ?? null,
              redo: redo.get(keyOf(e)) ?? null,
            }
          })
          return { configured: true, total: list.length, offset, limit, before, rows, counts: idx.counts }
        }
      } finally { db.close() }
    })

    // ---- redo with an external model ----
    const job = { running: false, cancelled: false, total: 0, done: 0, current: null, errors: [], startedAt: null, finishedAt: null }
    const redoFile = () => redoPathOf(settings().dbPath)

    const externalConfig = () => {
      const ext = settings().external ?? {}
      const key = ext.provider ? getSecret(ext.provider, ctx.home) : ''
      const needsKey = ext.provider === 'openai' || ext.provider === 'anthropic'
      if (!ext.provider || !ext.model || (needsKey && !key)) {
        throw httpError(400, 'No external model or API key is set: choose the provider and model, and save the key, in the Queue tab (external LLM).')
      }
      return { provider: ext.provider, model: ext.model, baseUrl: ext.baseUrl || undefined, apiKey: key }
    }
    const redact = (text, key) => { let t = String(text ?? ''); if (key) t = t.split(key).join('***'); return t.slice(0, ERROR_MAX) }

    async function redoOne(db, cfg, item, instructions) {
      const c = db.get(`${COMMENT_SQL} WHERE c.id = ?`, item.id)
      if (!c) throw new Error(`comment ${item.id} not found`)
      const hasMn = db.all('PRAGMA table_info(position_comments)').some((x) => x.name === 'move_number')
      const mn = hasMn ? db.get('SELECT move_number FROM position_comments WHERE id = ?', item.id)?.move_number : null
      const storedOf = (lang) => db.get('SELECT text FROM comment_translations WHERE comment_id = ? AND lang = ?', item.id, lang)?.text ?? null
      const base = { lang: c.own, fen: `${c.position} 0 1`, move: moveLabel({ ply: c.ply, san: c.san, move_number: mn }) }
      let prompt, source, previous
      if (item.action === 'universal') {
        source = toFigurines(c.text, 'en')
        previous = storedOf(c.own)
        prompt = universalPromptV2({ ...base, text: source })
      } else {
        // A translation is made from the normalized text, never from the original.
        const universal = storedOf(c.own)
        if (!universal) throw new Error('normalize the comment first: translations are made from the normalized text')
        source = universal
        previous = storedOf(item.lang)
        prompt = translatePromptV2({ ...base, text: source }, item.lang)
      }
      if (instructions) prompt = { ...prompt, system: `${prompt.system}\nAdditional instructions from the user: ${instructions}` }
      // A local model goes through Ollama's chat; an external one through its provider.
      const answer = cfg.local ? await chatFn()(settings().ollamaUrl, { model: cfg.model, ...prompt, json: true }) : await completeFn()(cfg, { ...prompt, json: true })
      const parsed = parseAiAnswer(answer.text)
      const proposal = parsed.skip ? '' : parsed.text
      const problems = parsed.skip && item.action === 'universal' ? [] : parsed.skip ? ['a translation cannot be skipped'] : validateRewrite(source, proposal, { removal: item.action === 'universal' ? ctx.settings().removal ?? 'moderate' : 'strict', move: base.move })
      return { id: item.id, lang: item.action === 'universal' ? c.own : item.lang, action: item.action, original: source, previous, proposal, problems, model: cfg.model, status: 'proposed', at: new Date().toISOString() }
    }

    async function runJob(cfg, items, instructions) {
      const s = settings()
      const db = openDb(s.dbPath, { readOnly: true })
      try {
        for (const item of items) {
          if (job.cancelled) break
          job.current = { id: item.id, action: item.action, lang: item.lang }
          try {
            const entry = await redoOne(db, cfg, item, instructions)
            const all = readRedo(redoFile()).filter((e) => keyOf(e) !== keyOf(entry))
            writeRedo(redoFile(), [...all, entry])
          } catch (e) {
            job.errors.push({ id: item.id, action: item.action, lang: item.lang, error: redact(e.message, cfg.apiKey) })
          }
          job.done++
          if (!job.cancelled && ctx.redoDelayMs !== 0) await new Promise((r) => setTimeout(r, ctx.redoDelayMs ?? 500))
        }
      } finally {
        db.close()
        job.running = false
        job.current = null
        job.finishedAt = new Date().toISOString()
      }
    }

    app.get('/api/results/redo', () => {
      const s = settings()
      const proposals = s.dbPath ? readRedo(redoFile()) : []
      return { job: { ...job, errors: [...job.errors] }, proposals: proposals.map((e) => ({ ...e, key: keyOf(e) })).reverse() }
    })

    app.post('/api/results/redo', async (c) => {
      const body = await c.body()
      const s = settings()
      if (!s.dbPath) throw httpError(400, 'no database set: choose one in the settings')
      const items = Array.isArray(body.items) ? body.items : []
      if (!items.length) throw httpError(400, 'select at least one result')
      for (const it of items) {
        if (!Number.isInteger(it?.id) || !['universal', 'translate'].includes(it.action) || (it.action === 'translate' && !/^[a-z]{2}$/.test(it.lang ?? ''))) throw httpError(400, 'each item needs { id, action: universal|translate, lang }')
      }
      if (job.running) throw httpError(409, 'a redo job is already running')
      if (body.via !== undefined && body.via !== 'external' && body.via !== 'local') throw httpError(400, 'via must be external or local')
      let cfg
      if (body.via === 'local') {
        if (typeof body.model !== 'string' || !body.model.trim()) throw httpError(400, 'choose the local model to use')
        cfg = { local: true, model: body.model.trim() }
      } else cfg = externalConfig()
      const instructions = typeof body.instructions === 'string' ? body.instructions.trim().slice(0, 1000) : ''
      Object.assign(job, { running: true, cancelled: false, total: items.length, done: 0, current: null, errors: [], startedAt: new Date().toISOString(), finishedAt: null })
      void runJob(cfg, items, instructions)
      return { started: true, total: items.length }
    })

    app.post('/api/results/redo/cancel', () => { if (job.running) job.cancelled = true; return { cancelled: job.running } })

    /** The proposals a request names: a comment id (all its proposals) or "id:lang". */
    const pick = (entries, ids) => {
      const wanted = (Array.isArray(ids) ? ids : []).map(String)
      return entries.filter((e) => e.status === 'proposed' && (wanted.includes(String(e.id)) || wanted.includes(keyOf(e))))
    }
    const mark = (file, picked, status) => {
      const keys = new Set(picked.map(keyOf))
      writeRedo(file, readRedo(file).map((e) => (keys.has(keyOf(e)) ? { ...e, status } : e)))
    }

    app.post('/api/results/redo/apply', async (c) => {
      const body = await c.body()
      const s = settings()
      if (!s.dbPath) throw httpError(400, 'no database set: choose one in the settings')
      const file = redoFile()
      const picked = pick(readRedo(file), body.ids)
      if (!picked.length) throw httpError(404, 'no pending proposal matches')
      const bad = picked.filter((e) => e.problems?.length)
      if (bad.length && body.force !== true) {
        throw httpError(400, `${bad.length} proposal(s) have validation problems (${bad.slice(0, 5).map(keyOf).join(', ')}); review them or apply with force`)
      }
      const db = openDb(s.dbPath, { readOnly: false })
      try {
        for (const e of picked) if (!db.get('SELECT 1 AS x FROM position_comments WHERE id = ?', e.id)) throw httpError(404, `comment ${e.id} not found in the database`)
        db.exec('BEGIN IMMEDIATE')
        try {
          for (const e of picked) db.run('INSERT OR REPLACE INTO comment_translations (comment_id, lang, text) VALUES (?, ?, ?)', e.id, e.lang, e.proposal)
          db.exec('COMMIT')
        } catch (err) { db.exec('ROLLBACK'); throw err }
      } finally { db.close() }
      mark(file, picked, 'applied')
      return { applied: picked.length }
    })

    app.post('/api/results/redo/discard', async (c) => {
      const body = await c.body()
      const s = settings()
      if (!s.dbPath) throw httpError(400, 'no database set: choose one in the settings')
      const file = redoFile()
      const picked = pick(readRedo(file), body.ids)
      if (!picked.length) throw httpError(404, 'no pending proposal matches')
      mark(file, picked, 'discarded')
      return { discarded: picked.length }
    })

    // ---- review of one stored translation: edit, revoke ----
    const checkTarget = (db, params) => {
      const id = Number.parseInt(params.id, 10)
      if (!Number.isInteger(id) || String(id) !== params.id) throw httpError(400, 'invalid id')
      if (!/^[a-z]{2}$/.test(params.lang)) throw httpError(400, 'lang must be a 2-letter code')
      const c = db.get('SELECT lang AS own FROM position_comments WHERE id = ?', id)
      if (!c) throw httpError(404, `comment ${id} not found`)
      if (c.own === params.lang) throw httpError(400, 'the comment\'s own language is its normalized text, not a translation')
      return { id, lang: params.lang, own: c.own }
    }
    const logChange = (db, t, status, previous, proposal) => {
      const file = redoFile()
      const source = db.get('SELECT text FROM comment_translations WHERE comment_id = ? AND lang = ?', t.id, t.own)?.text ?? ''
      writeRedo(file, [...readRedo(file).filter((e) => keyOf(e) !== keyOf(t)), { id: t.id, lang: t.lang, action: 'translate', original: source, previous, proposal, problems: [], model: 'manual', status, at: new Date().toISOString() }])
    }
    const writeDb = (fn) => {
      const s = settings()
      if (!s.dbPath) throw httpError(400, 'no database set: choose one in the settings')
      const db = openDb(s.dbPath, { readOnly: false })
      try {
        const t = fn.target(db)
        db.exec('BEGIN IMMEDIATE')
        try { const out = fn.write(db, t); db.exec('COMMIT'); return out } catch (e) { db.exec('ROLLBACK'); throw e }
      } finally { db.close() }
    }

    app.put('/api/results/translations/:id/:lang', async (c) => {
      const body = await c.body()
      const text = typeof body.text === 'string' ? body.text.trim() : ''
      if (!text) throw httpError(400, 'the translation cannot be empty; revoke it instead')
      let target
      writeDb({
        target: (db) => { target = checkTarget(db, c.params); return target },
        write: (db, t) => {
          const previous = db.get('SELECT text FROM comment_translations WHERE comment_id = ? AND lang = ?', t.id, t.lang)?.text ?? null
          db.run('INSERT OR REPLACE INTO comment_translations (comment_id, lang, text) VALUES (?, ?, ?)', t.id, t.lang, text)
          logChange(db, t, 'edited', previous, text)
        },
      })
      return { saved: true, id: target.id, lang: target.lang }
    })

    app.delete('/api/results/translations/:id/:lang', (c) => {
      writeDb({
        target: (db) => checkTarget(db, c.params),
        write: (db, t) => {
          const previous = db.get('SELECT text FROM comment_translations WHERE comment_id = ? AND lang = ?', t.id, t.lang)?.text
          if (previous === undefined) throw httpError(404, 'that translation does not exist')
          db.run('DELETE FROM comment_translations WHERE comment_id = ? AND lang = ?', t.id, t.lang)
          logChange(db, t, 'revoked', previous, null)
        },
      })
      return { revoked: true }
    })

    app.get('/api/results/:id', async (c) => {
      const s = settings()
      if (!configured(s)) return { configured: false }
      const id = Number.parseInt(c.params.id, 10)
      if (!Number.isInteger(id)) throw httpError(400, 'invalid id')
      const idx = await indexFor(s.reviewPath).read()
      const mine = idx.entries.filter((e) => e.id === id).sort((a, b) => b.seq - a.seq)
      const attempts = await Promise.all(mine.map(async (e) => ({ seq: e.seq, ...(await idx.load(e)) })))
      return withDb(s.dbPath, (db) => {
        const comment = db.get(`${COMMENT_SQL} WHERE c.id = ?`, id) ?? null
        const stored = Object.fromEntries(db.all('SELECT lang, text FROM comment_translations WHERE comment_id = ?', id).map((r) => [r.lang, r.text]))
        const redo = readRedo(redoFile()).filter((e) => e.id === id)
        return { configured: true, comment: comment ? { ...comment, fen: fenOf(comment.position), mark: destinationSquare(comment.san) } : null, stored, attempts, redo }
      }, { readOnly: true })
    })
  },
}
