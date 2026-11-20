// scripts/translate-comments.mjs against a small comments.sqlite and a mocked
// OpenAI-compatible endpoint (no network).
import { createRequire } from 'node:module'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { moveKeys, translateComments, validateRewrite } from './translate-comments.mjs'

// Vite 5 cannot resolve the node:sqlite builtin, so it is loaded with require.
const { DatabaseSync } = createRequire(import.meta.url)('node:sqlite')
const SCHEMA = new URL('../../../apps/api/migrations/005_position_comments.sql', import.meta.url)

const BOOK_TEXT = 'Morphy played 9.Bg5 and Black was lost after 10...b5.'
const STUDY_TEXT = 'After 12...Nb6 the knight eyes c4 and d5.'

let dir
let dbPath
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'translate-'))
  dbPath = join(dir, 'comments.sqlite')
  const db = new DatabaseSync(dbPath)
  db.exec(readFileSync(SCHEMA, 'utf8'))
  db.exec('ALTER TABLE position_comments ADD COLUMN move_number INTEGER')
  db.exec(`INSERT INTO comment_sources VALUES (1, 'book', 'Invented book', 'An Author', 'en', 1), (2, 'lichess', 'Invented study', 'coach', 'en', 2);
    INSERT INTO comment_games VALUES ('1-1', 1, 'Morphy', 'Duke', NULL, '1. e4 *'), ('2-1', 2, NULL, NULL, NULL, '1. d4 *');
    INSERT INTO position_comments (id, hash, position, game_id, ply, san, lang, text, move_number) VALUES
      (1, 'aa', 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq -', '1-1', 17, 'Bg5', 'en', '${BOOK_TEXT}', 9),
      (2, 'bb', 'rnbqkbnr/pppppppp/8/8/3P4/8/PPP1PPPP/RNBQKBNR b KQkq -', '2-1', 24, 'Nb6', 'en', '${STUDY_TEXT}', 12);`)
  db.close()
})
afterEach(() => rmSync(dir, { recursive: true, force: true }))

const rows = () => {
  const db = new DatabaseSync(dbPath)
  const all = db.prepare('SELECT comment_id, lang, text FROM comment_translations ORDER BY comment_id, lang').all().map((r) => ({ ...r }))
  db.close()
  return all
}

/** An endpoint answering from a function of the request body; records every call. */
function endpoint(answer) {
  const calls = []
  const fetchImpl = async (url, init) => {
    const body = JSON.parse(init.body)
    calls.push({ url: String(url), headers: init.headers, body })
    const content = answer(body)
    return { ok: true, status: 200, json: async () => ({ model: body.model, choices: [{ message: { content } }] }) }
  }
  return { calls, fetchImpl }
}
const userText = (body) => body.messages.find((m) => m.role === 'user').content
const run = (opts, fetchImpl) => translateComments(
  { db: dbPath, baseUrl: 'http://llm.test/v1', model: 'tiny', langs: ['es', 'de'], review: join(dir, 'review.jsonl'), ...opts },
  { fetchImpl, sleep: async () => {}, log: () => {} },
)
const review = () => readFileSync(join(dir, 'review.jsonl'), 'utf8').trim().split('\n').map((l) => JSON.parse(l))

describe('move keys', () => {
  it('see the same move in any piece letters and flag a lost one', () => {
    expect(moveKeys('12...Nb6')).toEqual(moveKeys('12...Cb6'))
    expect(moveKeys('Sb6 dxe5 O-O')).toEqual(['Pb6', 'pxe5', 'O-O'])
    expect(validateRewrite('After 12...Nb6 and 13.Bxe6', 'Tras 12...Cb6')).toEqual(['moves missing from the proposal: Bxe6'])
    expect(validateRewrite('After 12...Nb6', 'Tras 12...Cb6 el caballo')).toEqual([])
  })

  it('flag a move the proposal adds (the model must not invent moves)', () => {
    expect(validateRewrite('After 12...Nb6', 'Tras 6.Ae3 y 12...Cb6')).toEqual(['moves added to the proposal: Ae3'])
  })
})

describe('translateComments', () => {
  it('translates into each language with that language\'s letters, writes rows and a review line per proposal', async () => {
    const { calls, fetchImpl } = endpoint((b) => {
      const es = b.messages[0].content.includes('Spanish')
      const text = userText(b).includes('Nb6') ? (es ? 'Tras 12...Cb6 el caballo mira c4 y d5.' : 'Nach 12...Sb6 zielt der Springer auf c4 und d5.')
        : (es ? 'Morphy jugó 9.Ag5 y tras 10...b5 las negras estaban perdidas.' : 'Morphy spielte 9.Lg5.') // German drops 10...b5
      return JSON.stringify({ text })
    })
    const summary = await run({}, fetchImpl)

    expect(calls).toHaveLength(4)
    expect(calls[0].url).toBe('http://llm.test/v1/chat/completions')
    expect(calls[0].body.model).toBe('tiny')
    expect(calls[0].headers.Authorization).toBeUndefined()
    expect(rows()).toEqual([
      { comment_id: 1, lang: 'es', text: 'Morphy jugó 9.Ag5 y tras 10...b5 las negras estaban perdidas.' },
      { comment_id: 2, lang: 'de', text: 'Nach 12...Sb6 zielt der Springer auf c4 und d5.' },
      { comment_id: 2, lang: 'es', text: 'Tras 12...Cb6 el caballo mira c4 y d5.' },
    ])
    expect(summary).toMatchObject({ written: 3, rejected: 1 })
    const rejected = review().find((r) => r.status === 'rejected')
    expect(rejected).toMatchObject({ id: 1, lang: 'de', action: 'translate', original: BOOK_TEXT, problems: ['moves missing from the proposal: b5'] })
  })

  it('is resumable: an existing translation is not asked again', async () => {
    const db = new DatabaseSync(dbPath)
    db.exec("INSERT INTO comment_translations VALUES (1, 'es', 'ya hecho'), (1, 'de', 'schon da')")
    db.close()
    const { calls, fetchImpl } = endpoint(() => JSON.stringify({ text: 'Tras 12...Cb6 x' }))
    await run({ langs: ['es'] }, fetchImpl)
    expect(calls).toHaveLength(1)
    expect(userText(calls[0].body)).toContain(STUDY_TEXT)
  })

  it('universalises first (row in the comment\'s own language) and translates the universal text; sends the key', async () => {
    const universal = 'After 12...Nb6 the knight eyes the c4 and d5 squares.'
    const { calls, fetchImpl } = endpoint((b) =>
      JSON.stringify({ text: b.messages[0].content.includes('any game') ? universal : 'Tras 12...Cb6 el caballo apunta a c4 y d5.' }))
    await run({ universal: true, langs: ['es'], sourceKind: 'lichess', key: 'sk-test' }, fetchImpl)

    expect(calls).toHaveLength(2)
    expect(calls[0].headers.Authorization).toBe('Bearer sk-test')
    expect(calls[0].body.messages[0].content).toMatch(/no player names/i)
    expect(userText(calls[1].body)).toContain(universal)
    expect(rows()).toEqual([
      { comment_id: 2, lang: 'en', text: universal },
      { comment_id: 2, lang: 'es', text: 'Tras 12...Cb6 el caballo apunta a c4 y d5.' },
    ])
  })

  it('dry run: asks the model and writes the review, never the database; limit counts comments', async () => {
    const { calls, fetchImpl } = endpoint(() => JSON.stringify({ text: 'Morphy jugó 9.Ag5 y tras 10...b5 todo acabó.' }))
    const summary = await run({ dryRun: true, limit: 1, langs: ['es'] }, fetchImpl)
    expect(calls).toHaveLength(1)
    expect(rows()).toEqual([])
    expect(summary).toMatchObject({ written: 0, accepted: 1 })
    expect(review()).toEqual([expect.objectContaining({ id: 1, lang: 'es', status: 'accepted', dryRun: true })])
  })

  it('records an answer that is not JSON as failed and goes on', async () => {
    const { fetchImpl } = endpoint((b) => (userText(b).includes('Nb6') ? 'sorry, no' : JSON.stringify({ text: 'Morphy jugó 9.Ag5 y 10...b5.' })))
    const summary = await run({ langs: ['es'] }, fetchImpl)
    expect(summary).toMatchObject({ written: 1, failed: 1 })
    expect(review().find((r) => r.id === 2)).toMatchObject({ status: 'failed', problems: ['The model did not answer with JSON.'] })
  })
})

/** Ollama's native /api/chat answering from a function of the request body. */
function ollama(answer) {
  const calls = []
  const fetchImpl = async (url, init) => {
    const body = JSON.parse(init.body)
    calls.push({ url: String(url), body })
    if (String(url).endsWith('/api/generate')) return { ok: true, status: 200, json: async () => ({}) }
    return { ok: true, status: 200, json: async () => ({ model: body.model, message: { content: answer(body) } }) }
  }
  return { calls, fetchImpl }
}
const v2 = (opts, fetchImpl) => translateComments({ db: dbPath, model: 'gpt-oss:20b', translateModel: 'translategemma:27b', ollama: true, v2: true, universal: true, langs: ['es'], delayMs: 0, review: join(dir, 'review.jsonl'), ...opts }, { fetchImpl, sleep: async () => {}, log: () => {} })

describe('v2: Ollama native, figurines, skipped comments, two models', () => {
  it('keeps the models loaded, sends moves as figurines and uses one model to universalise and another to translate', async () => {
    const { calls, fetchImpl } = ollama((b) => JSON.stringify({ text: b.model === 'gpt-oss:20b' ? 'After 12...♘b6 the knight eyes c4 and d5.' : 'Tras 12...♘b6 el caballo apunta a c4 y d5.' }))
    await v2({ sourceKind: 'lichess' }, fetchImpl)
    const chats = calls.filter((c) => c.url.endsWith('/api/chat'))
    expect(calls.filter((c) => c.url.endsWith('/api/generate')).map((c) => [c.body.model, c.body.keep_alive])).toEqual([['gpt-oss:20b', -1], ['translategemma:27b', -1]])
    expect(chats.map((c) => c.body.model)).toEqual(['gpt-oss:20b', 'translategemma:27b'])
    expect(chats.every((c) => c.body.keep_alive === -1)).toBe(true)
    expect(chats[0].body.messages[1].content).toContain('12...♘b6')
    expect(rows()).toEqual([
      { comment_id: 2, lang: 'en', text: 'After 12...♘b6 the knight eyes c4 and d5.' },
      { comment_id: 2, lang: 'es', text: 'Tras 12...♘b6 el caballo apunta a c4 y d5.' },
    ])
  })

  it('a comment with no chess content left is dropped: an empty row in its own language, no translations, never asked again', async () => {
    const { calls, fetchImpl } = ollama(() => JSON.stringify({ text: '', skip: true }))
    const summary = await v2({ sourceKind: 'lichess' }, fetchImpl)
    expect(calls.filter((c) => c.url.endsWith('/api/chat'))).toHaveLength(1)
    expect(rows()).toEqual([{ comment_id: 2, lang: 'en', text: '' }])
    expect(summary).toMatchObject({ dropped: 1, written: 1 })
    const again = ollama(() => JSON.stringify({ text: 'x' }))
    await v2({ sourceKind: 'lichess' }, again.fetchImpl)
    expect(again.calls.filter((c) => c.url.endsWith('/api/chat'))).toHaveLength(0)
  })

  it('a universal rewrite that is rejected is not translated: the original names its players', async () => {
    const { calls, fetchImpl } = ollama(() => JSON.stringify({ text: 'Nothing like the original.' }))
    const summary = await v2({ sourceKind: 'lichess' }, fetchImpl)
    expect(calls.filter((c) => c.url.endsWith('/api/chat'))).toHaveLength(1)
    expect(summary).toMatchObject({ rejected: 1, written: 0 })
    expect(rows()).toEqual([])
  })

  it('phase normalize only standardises (no translation); phase translate only translates what is already standardised', async () => {
    const answer = (b) => JSON.stringify({ text: b.messages[1].content.includes('♘b6') ? 'After 12...♘b6 the knight eyes c4 and d5.' : 'The ♗g5 and ...b5 are strong.' })
    const first = ollama(answer)
    await v2({ phase: 'normalize' }, first.fetchImpl)
    expect(first.calls.filter((c) => c.url.endsWith('/api/chat'))).toHaveLength(2)
    expect(rows().map((r) => `${r.comment_id}:${r.lang}`)).toEqual(['1:en', '2:en'])
    const second = ollama(answer)
    await v2({ phase: 'translate' }, second.fetchImpl)
    expect(second.calls.filter((c) => c.url.endsWith('/api/chat')).map((c) => c.body.model)).toEqual(['translategemma:27b', 'translategemma:27b'])
    expect(rows().map((r) => `${r.comment_id}:${r.lang}`)).toEqual(['1:en', '1:es', '2:en', '2:es'])
  })

  it('phase translate leaves a comment that was never standardised alone', async () => {
    const { calls, fetchImpl } = ollama(() => JSON.stringify({ text: 'x' }))
    await v2({ phase: 'translate' }, fetchImpl)
    expect(calls.filter((c) => c.url.endsWith('/api/chat'))).toHaveLength(0)
  })

  it('only-lang works on the comments written in that language', async () => {
    const { calls, fetchImpl } = ollama(() => JSON.stringify({ text: 'x' }))
    await v2({ phase: 'normalize', onlyLang: 'es' }, fetchImpl)
    expect(calls.filter((c) => c.url.endsWith('/api/chat'))).toHaveLength(0)
  })

  it('works on several comments at once and gets through all of them', async () => {
    const { calls, fetchImpl } = ollama((b) => JSON.stringify({ text: b.messages[1].content.includes('♘b6') ? 'After 12...♘b6 the knight eyes c4 and d5.' : 'The ♗g5 and ...b5 are strong.' }))
    const summary = await v2({ concurrency: 2 }, fetchImpl)
    expect(summary.comments).toBe(2)
    expect(calls.filter((c) => c.url.endsWith('/api/chat'))).toHaveLength(4)
    expect(rows().map((r) => `${r.comment_id}:${r.lang}`)).toEqual(['1:en', '1:es', '2:en', '2:es'])
  })
})
