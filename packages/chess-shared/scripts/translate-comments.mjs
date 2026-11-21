// Universalises and translates the comments of a commentary database with an
// OpenAI-compatible model (a local Ollama, OpenAI, or any /v1/chat/completions
// endpoint), checking that every move of the original survives.
//
// Usage:
//   node scripts/translate-comments.mjs <comments.sqlite> --model <name>
//     [--base-url http://localhost:11434/v1] [--key <api key>]
//     [--langs es,en,de,fr] [--universal] [--source-kind lichess|book]
//     [--limit <comments>] [--delay-ms 1000] [--review <file.jsonl>] [--dry-run]
//
// Environment: LLM_BASE_URL, LLM_MODEL, LLM_API_KEY stand in for the flags.
//
// --universal   first rewrites each comment for any game reaching the position
//               (no names, no book or game references) and stores it as the
//               comment_translations row in the comment's own language; the
//               translations are then made from that universal text.
// --langs       target languages (default es,en,de,fr); the comment's own
//               language is only written by --universal.
// --dry-run     asks the model and writes the review file, never the database.
//
// Resumable: a (comment, language) that already has a comment_translations row
// is skipped. A proposal that loses a move of the original, is empty or more
// than 3 times longer is not written; it goes to the review file (default
// <comments.sqlite>.review.jsonl, appended) with its problems, like every
// other proposal, for a human to check.
import { appendFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'
import { toFigurines } from './figurines.mjs'

export const TARGET_LANGS = ['es', 'en', 'de', 'fr']
const LANGS = {
  en: { name: 'English', pieces: 'K, Q, R, B, N (English SAN)' },
  es: { name: 'Spanish', pieces: 'R (rey), D (dama), T (torre), A (alfil), C (caballo)' },
  de: { name: 'German', pieces: 'K (König), D (Dame), T (Turm), L (Läufer), S (Springer)' },
  fr: { name: 'French', pieces: 'R (roi), D (dame), T (tour), F (fou), C (cavalier)' },
}
const langName = (lang) => LANGS[lang]?.name ?? lang

// Prompts and move check ported from apps/web/src/features/comments/commentPrompts.ts.
const JSON_TEXT = 'Answer with JSON only, exactly {"text": "<the new comment>"}, and nothing else.'
const KEEP_MOVES = 'Keep every move the comment mentions (e.g. 13. Bxe6, Qh4+, O-O) and its chess meaning; write the moves in the piece letters of the language of the answer, or keep figurines when the comment uses them. Do not add moves, evaluations or facts that are not in the comment.'

const commentMessage = (c) => `Position (FEN): ${c.fen}\nLast move: ${c.move}\nComment (${langName(c.lang)}):\n${c.text}`

export function universalPrompt(c) {
  return {
    system: [
      'You edit chess commentary.',
      'Rewrite the comment so that it applies to any game that reaches this position, not only to the game or book it was taken from.',
      'Use no player names, no references to the book, the chapter, the game, the tournament or other games; speak of White and Black.',
      `Keep the chess content and write in the language of the comment (${langName(c.lang)}).`,
      KEEP_MOVES,
      JSON_TEXT,
    ].join('\n'),
    user: commentMessage(c),
  }
}

export function translatePrompt(c, target) {
  const t = LANGS[target]
  return {
    system: [
      'You translate chess commentary.',
      `Translate the comment into ${t.name}, faithfully and naturally, as a chess author writing in ${t.name} would.`,
      `Write the moves with the ${t.name} piece letters: ${t.pieces}. Keep figurines as they are.`,
      KEEP_MOVES,
      JSON_TEXT,
    ].join('\n'),
    user: commentMessage(c),
  }
}

const JSON_SKIP = 'Answer with JSON only: {"text": "<the new comment>"}.'

/**
 * v2 (measured with local models, see README): moves travel as figurines so no
 * language has to convert them; names and references are removed; a comment
 * with no chess content left is dropped ({"skip": true}).
 */
export function universalPromptV2(c) {
  return {
    system: [
      'You are an editor of chess commentary. Rewrite the comment so that it is true and useful for ANY game that reaches the given position, not only the game it was written for.',
      'Rules:',
      '1. Remove every reference to the players of the game, the tournament, date, book, chapter, note, or to other moments of the game ("earlier", "as we saw", "the previous move"). Speak of White and Black, the white knight, etc. Remove greetings, results and personal remarks ("I think", "my notes"). Exception: a quotation is never removed. Keep every quotation (text in quotation marks, or "X said/wrote/according to X ...") whole, together with who said it (the person or source quoted, e.g. "Tarrasch said: ...", "(Euwe)"); it may be translated like the rest but neither the quotation nor its author may be dropped or anonymised. Always keep the quotation together with its author, in the same sentence.',
      '2. Keep every chess idea, plan and evaluation of the comment, in the same language as the comment. Do not add facts.',
      '3. Moves are written with figurines (♘f3, ♗xe6, ♕h4+, O-O, e4, dxe5). Copy every move you keep exactly as it is; never add or change one. Do not use piece letters.',
      '4. A comment is read at the given position, with the given last move. It may tell what was played AFTER this position in this game ("White then played 13 ♘xe5", "the game went on 14...♗g4 15 ♕d2", "he resigned four moves later"): those moves are not part of the position, they make the comment specific to one game. Remove those parts. Keep what explains the last move or the position: ideas, plans, threats, evaluations, and hypothetical lines or alternatives from this position ("better was 12 h3", "if White takes, then ..."). The last move itself and the moves before the position are fine to mention.',
      '5. If no chess content remains after removing those references and the later moves (only the result, greetings, news about the event, or a story of what was played next), and nothing useful remains to understand the last move or the position, answer {"text": "", "skip": true}.',
      JSON_SKIP,
    ].join('\n'),
    user: `Position (FEN): ${c.fen}\nLast move: ${c.move}\nComment:\n${c.text}`,
  }
}

export function translatePromptV2(c, target) {
  const name = langName(target)
  return {
    system: [
      `You translate chess commentary into ${name}, as a chess author writing in ${name} would: natural and with the usual chess terminology.`,
      'Moves are written with figurines (♘f3, ♗xe6, ♕h4+, O-O, e4). Copy them exactly as they are: do not convert them to letters, do not translate them, do not add or drop any. Keep move numbers and punctuation like "…" as they are.',
      'Do not add or remove ideas.',
      `A quotation of an author (words in quotation marks, or "X said/wrote ...", "(Euwe)") stays with its author: translate the quoted words into ${name}, and write the author's name as it is written; never drop the quotation, never drop or anonymise its author.`,
      JSON_SKIP,
    ].join('\n'),
    user: `Comment (${langName(c.lang)}):\n${c.text}`,
  }
}

/** {text, skip} of a model answer; an empty text is only valid with skip: true. */
export function parseAiAnswer(answer) {
  const fenced = /```(?:json)?\s*([\s\S]*?)```/.exec(answer)
  const raw = (fenced ? fenced[1] : answer).trim()
  const start = raw.indexOf('{')
  let value
  try { value = JSON.parse(start >= 0 ? raw.slice(start, raw.lastIndexOf('}') + 1) : raw) } catch { /* below */ }
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('The model did not answer with JSON.')
  if (value.skip === true) return { text: '', skip: true }
  if (typeof value.text !== 'string' || !value.text.trim()) throw new Error('The model gave an empty comment.')
  return { text: value.text.trim(), skip: false }
}

/** The text of a {"text": …} answer (fenced or with prose around it). */
export function parseAiText(answer) {
  const fenced = /```(?:json)?\s*([\s\S]*?)```/.exec(answer)
  const raw = (fenced ? fenced[1] : answer).trim()
  const start = raw.indexOf('{')
  let value
  try { value = JSON.parse(start >= 0 ? raw.slice(start, raw.lastIndexOf('}') + 1) : raw) } catch { /* below */ }
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('The model did not answer with JSON.')
  if (typeof value.text !== 'string' || !value.text.trim()) throw new Error('The model gave an empty comment.')
  return value.text.trim()
}

const PIECE = 'KQRBNSLTDACF♔♕♖♗♘♙♚♛♜♝♞♟'
const MOVE_RE = new RegExp(`(?<![\\p{L}\\d])(?:([O0]-[O0]-[O0])|([O0]-[O0])|([${PIECE}])?([a-h]?[1-8]?)([x:×])?([a-h][1-8])(=?[${PIECE}]|=)?)[+#]?[!?]*(?![\\p{L}\\d])`, 'gu')

/** The moves of a text as language-free keys ("Nb6", "Cb6", "♘b6" → "Pb6"; "dxe5" → "pxe5"). */
export function moveKeys(text) {
  return [...text.matchAll(MOVE_RE)].map((m) =>
    m[1] ? 'O-O-O' : m[2] ? 'O-O' : `${m[3] ? 'P' : 'p'}${m[5] ? 'x' : ''}${m[6]}${m[7] ? '=' : ''}`)
}

// Words that say a comment is talking about what happens later in the game (English, Spanish, German, French),
// and explicit references to a move number ("on move 14", "en la jugada 14", "im 14. Zug").
const LATER_CUE = new RegExp(
  '(?<![\\p{L}])(?:then|later|afterwards?|after that|next|followed|subsequently|eventually|finally|' +
  'luego|despu[eé]s|m[aá]s tarde|posteriormente|a continuaci[oó]n|seguidamente|finalmente|' +
  'dann|sp[aä]ter|danach|anschlie[sß]end|schlie[sß]lich|' +
  'puis|ensuite|plus tard|apr[eè]s|finalement|' +
  '(?:on |at |in )?(?:the )?(?:move|jugada|zug|coup)\\s*\\d+|\\d+\\s*(?:st|nd|rd|th|\\.)?\\s*(?:move|jugada|zug|coup))(?![\\p{L}])', 'iu')

/** The number of the move a label like "12...♘b6" or "13.e4" names; null when it has none. */
const labelNumber = (label) => { const m = /^\s*(\d+)/.exec(label ?? ''); return m ? Number(m[1]) : null }

/**
 * The moves of the original that a universal rewrite dropped but the comment excuses in the moderate mode:
 * each one follows a word that speaks of later play within 100 characters, or is written with a move number
 * after the commented move's.
 */
function unexcused(original, removed, move) {
  const current = labelNumber(move)
  let previous = null
  return removed.filter((m) => {
    const before = original.slice(Math.max(0, m.index - 100), m.index)
    const number = /(\d+)\s*(?:\.\.\.|…|\.)?\s*$/.exec(original.slice(Math.max(0, m.index - 10), m.index))
    // A move written right after an excused one (a line: "13 ♘xe5 ♗xe5 14 ♕h5") belongs to the same later play.
    const continuesLine = previous && /^[\s.…,;\d]*$/.test(original.slice(previous.index + previous[0].length, m.index))
    const excused = continuesLine || (number && current !== null && Number(number[1]) > current) || LATER_CUE.test(before)
    previous = excused ? m : null
    return !excused
  })
}

/**
 * The problems of a rewritten comment; [] when it may be stored.
 * removal: 'strict' (default) — every move of the original must stay;
 *          'moderate' — a move may go when the comment alludes to later play (a "then/later" cue or a later
 *          move number) near it; `move` is the commented move ("12...♘b6") the numbers are compared with.
 * A proposal never adds a move.
 */
export function validateRewrite(original, proposal, { removal = 'strict', move } = {}) {
  const problems = []
  const text = proposal.trim()
  if (!text) return ['the proposal is empty']
  if (text.length > 3 * Math.max(original.trim().length, 1)) problems.push('the proposal is more than 3 times longer than the original')
  const kept = new Set(moveKeys(text))
  const removed = [...original.matchAll(MOVE_RE)].filter((m) => !kept.has(moveKeys(m[0])[0]))
  const missing = (removal === 'moderate' ? unexcused(original, removed, move) : removed).map((m) => m[0])
  if (missing.length) problems.push(`moves missing from the proposal: ${[...new Set(missing)].join(', ')}`)
  // Stricter than the app's check: an unattended batch must not invent moves either.
  const known = new Set(moveKeys(original))
  const added = [...text.matchAll(MOVE_RE)].filter((m) => !known.has(moveKeys(m[0])[0])).map((m) => m[0])
  if (added.length) problems.push(`moves added to the proposal: ${[...new Set(added)].join(', ')}`)
  return problems
}

/** One chat completion; retries 429 and 5xx with backoff. */
const ollamaRoot = (baseUrl) => baseUrl.replace(/\/+$/, '').replace(/\/v1$/, '')
const noFormat = new Set()

/** Ollama's own API: keeps the model loaded in memory (keep_alive -1) and turns thinking off. */
async function completeOllama(prompt, { baseUrl, model, fetchImpl, sleep, retries = 3 }) {
  const url = `${ollamaRoot(baseUrl)}/api/chat`
  for (let attempt = 0; ; attempt++) {
    const body = {
      model, stream: false, keep_alive: -1, options: { temperature: 0.2, num_ctx: 4096 },
      messages: [{ role: 'system', content: prompt.system }, { role: 'user', content: prompt.user }],
    }
    if (!noFormat.has(model)) body.format = 'json'
    if (model.startsWith('gpt-oss')) body.think = 'low'
    else if (!model.startsWith('translategemma')) body.think = false
    const res = await fetchImpl(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(300_000) })
    const data = await res.json().catch(() => ({}))
    if (res.ok && !data.error) return { content: data.message?.content ?? '', model: data.model ?? model }
    if (/structured output/i.test(data.error ?? '') && !noFormat.has(model)) { noFormat.add(model); continue }
    if (attempt >= retries || (res.status !== 429 && res.status < 500)) throw new Error(data.error ?? `HTTP ${res.status}`)
    await sleep(2_000 * 2 ** attempt)
  }
}

/** Loads a model into memory and keeps it there until Ollama stops. */
export async function preloadOllama(baseUrl, model, fetchImpl = fetch) {
  await fetchImpl(`${ollamaRoot(baseUrl)}/api/generate`, { method: 'POST', body: JSON.stringify({ model, keep_alive: -1 }) })
}

async function complete(prompt, llmConfig) {
  if (llmConfig.ollama) return completeOllama(prompt, llmConfig)
  const { baseUrl, model, key, fetchImpl, sleep, retries = 3 } = llmConfig
  const headers = { 'Content-Type': 'application/json' }
  if (key) headers.Authorization = `Bearer ${key}`
  const body = JSON.stringify({
    model,
    temperature: 0.2,
    response_format: { type: 'json_object' },
    messages: [{ role: 'system', content: prompt.system }, { role: 'user', content: prompt.user }],
  })
  for (let attempt = 0; ; attempt++) {
    const res = await fetchImpl(`${baseUrl.replace(/\/+$/, '')}/chat/completions`, { method: 'POST', headers, body, signal: AbortSignal.timeout(180_000) })
    if (res.ok) {
      const data = await res.json()
      return { content: data.choices?.[0]?.message?.content ?? '', model: data.model ?? model }
    }
    if (attempt >= retries || (res.status !== 429 && res.status < 500)) throw new Error(`HTTP ${res.status}`)
    await sleep(res.status === 429 ? 30_000 * (attempt + 1) : 2_000 * 2 ** attempt)
  }
}

const moveLabel = (c) => {
  const n = c.move_number ?? Math.ceil(c.ply / 2)
  return `${n}${c.ply % 2 ? '.' : '...'}${c.san}`
}

/**
 * Runs the pass; returns { comments, accepted, written, rejected, failed, skipped }.
 * opts: { db, baseUrl, model, key, langs, universal, sourceKind, limit, delayMs, review, dryRun }
 */
export async function translateComments(opts, { fetchImpl = fetch, sleep = (ms) => new Promise((r) => setTimeout(r, ms)), log = console.log } = {}) {
  const { DatabaseSync } = createRequire(import.meta.url)('node:sqlite')
  const langs = opts.langs ?? TARGET_LANGS
  // Translations are made from the normalized text, never from the original: it still names players, tournaments and later moves.
  if (opts.v2 && !opts.universal && opts.phase !== 'normalize') throw new Error('translations are made from the normalized text: run with --universal (normalize first)')
  for (const l of langs) if (!LANGS[l]) throw new Error(`unsupported language: ${l} (use ${TARGET_LANGS.join(', ')})`)
  if (!opts.model) throw new Error('a model is needed (--model or LLM_MODEL)')
  const reviewPath = opts.review ?? `${opts.db}.review.jsonl`
  const baseUrl = opts.baseUrl ?? 'http://localhost:11434/v1'
  const llm = { baseUrl, model: opts.model, key: opts.key, fetchImpl, sleep, ollama: !!opts.ollama }
  // v2 may use another model to translate (a translation model is better at it than the one that rewrites).
  const translateLlm = { ...llm, model: opts.translateModel ?? opts.model }
  if (llm.ollama) for (const m of new Set([llm.model, translateLlm.model])) await preloadOllama(baseUrl, m, fetchImpl)
  const db = new DatabaseSync(opts.db)
  // Another process (the status console, a database viewer) may be reading: wait for it instead of failing with "database is locked".
  db.exec('PRAGMA busy_timeout = 30000')
  const where = opts.sourceKind ? 'WHERE s.kind = ?' : ''
  const hasMoveNumber = db.prepare('PRAGMA table_info(position_comments)').all().some((c) => c.name === 'move_number')
  const comments = db.prepare(`SELECT c.id, c.text, c.lang, c.position, c.ply, c.san${hasMoveNumber ? ', c.move_number' : ''}
    FROM position_comments c JOIN comment_games g ON g.id = c.game_id JOIN comment_sources s ON s.id = g.source_id ${where} ORDER BY c.id`)
    .all(...(opts.sourceKind ? [opts.sourceKind] : []))
  const existing = db.prepare('SELECT text FROM comment_translations WHERE comment_id = ? AND lang = ?')
  const insert = db.prepare('INSERT OR REPLACE INTO comment_translations (comment_id, lang, text) VALUES (?, ?, ?)')
  const summary = { comments: 0, accepted: 0, written: 0, rejected: 0, failed: 0, skipped: 0, dropped: 0 }
  let calls = 0

  const propose = async (c, action, lang, prompt, source, config) => {
    if (calls++ > 0 && opts.delayMs) await sleep(opts.delayMs)
    const line = { id: c.id, lang, action, original: source, proposal: null, problems: [], model: config.model, status: 'failed' }
    try {
      const answer = await complete(prompt, config)
      line.model = answer.model
      const parsed = opts.v2 ? parseAiAnswer(answer.content) : { text: parseAiText(answer.content), skip: false }
      if (parsed.skip) {
        if (action !== 'universal') throw new Error('a translation cannot be skipped')
        line.status = 'dropped'
      } else {
        line.proposal = parsed.text
        line.problems = validateRewrite(source, line.proposal, { removal: opts.v2 && action === 'universal' ? opts.removal ?? 'moderate' : 'strict', move: moveLabel(c) })
        line.status = line.problems.length ? 'rejected' : 'accepted'
      }
    } catch (e) {
      line.problems = [e.message]
    }
    if (opts.dryRun) line.dryRun = true
    appendFileSync(reviewPath, JSON.stringify(line) + '\n')
    if (line.status === 'dropped') {
      summary.dropped++
      if (!opts.dryRun) { insert.run(c.id, lang, ''); summary.written++ }
      return { dropped: true }
    }
    summary[line.status === 'accepted' ? 'accepted' : line.status]++
    if (line.status !== 'accepted') return null
    if (!opts.dryRun) { insert.run(c.id, lang, line.proposal); summary.written++ }
    return line.proposal
  }

  const handle = async (c) => {
    const own = existing.get(c.id, c.lang)?.text
    if (opts.onlyLang && c.lang !== opts.onlyLang) return
    const todo = opts.phase === 'normalize' ? [] : langs.filter((l) => l !== c.lang && existing.get(c.id, l) === undefined)
    const universalDue = opts.universal && own === undefined && opts.phase !== 'translate'
    // Translating comes after standardising: a comment not standardised yet waits for its turn.
    if (opts.phase === 'translate' && opts.universal && own === undefined) { summary.skipped++; return }
    // An empty own-language row marks a comment dropped as not universal: nothing more is done with it.
    if (own === '' || (!todo.length && !universalDue)) { summary.skipped++; return }
    summary.comments++
    const text = opts.v2 ? toFigurines(c.text, 'en') : c.text
    const input = { text, lang: c.lang, fen: `${c.position} 0 1`, move: moveLabel(c) }
    let source = opts.universal ? own ?? null : null
    if (universalDue) {
      const made = await propose(c, 'universal', c.lang, (opts.v2 ? universalPromptV2 : universalPrompt)(input), text, llm)
      if (made?.dropped) return
      source = made
      // The original still carries names and references: it is never translated in place of the rewrite.
      if (!source) return
    }
    const from = source ? { ...input, text: source } : input
    for (const lang of todo) await propose(c, 'translate', lang, (opts.v2 ? translatePromptV2 : translatePrompt)(from, lang), from.text, translateLlm)
    log(`#${c.id}: ${summary.accepted} accepted, ${summary.rejected} rejected, ${summary.failed} failed, ${summary.dropped} dropped so far`)
  }

  try {
    // Several comments in flight at once (the model server batches them); each worker takes the next one.
    let next = 0
    const worker = async () => {
      while (next < comments.length) {
        if (opts.limit && summary.comments >= opts.limit) return
        await handle(comments[next++])
      }
    }
    await Promise.all(Array.from({ length: Math.max(1, opts.concurrency ?? 1) }, worker))
  } finally {
    db.close()
  }
  log(`${summary.comments} comments: ${summary.accepted} accepted (${summary.written} written${opts.dryRun ? ', dry run' : ''}), ${summary.rejected} rejected, ${summary.failed} failed, ${summary.dropped} dropped, ${summary.skipped} already done; review: ${reviewPath}`)
  return summary
}

function parseArgs(argv) {
  const flags = { db: null }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    const value = () => { const v = argv[++i]; if (v === undefined) throw new Error(`${a} needs a value`); return v }
    if (a === '--model') flags.model = value()
    else if (a === '--base-url') flags.baseUrl = value()
    else if (a === '--key') flags.key = value()
    else if (a === '--langs') flags.langs = value().split(',').map((s) => s.trim()).filter(Boolean)
    else if (a === '--universal') flags.universal = true
    else if (a === '--source-kind') flags.sourceKind = value()
    else if (a === '--limit') flags.limit = Number(value())
    else if (a === '--delay-ms') flags.delayMs = Number(value())
    else if (a === '--review') flags.review = value()
    else if (a === '--dry-run') flags.dryRun = true
    else if (a === '--ollama') flags.ollama = true
    else if (a === '--phase') flags.phase = value()
    else if (a === '--only-lang') flags.onlyLang = value()
    else if (a === '--v2') flags.v2 = true
    else if (a === '--translate-model') flags.translateModel = value()
    else if (a === '--concurrency') flags.concurrency = Number(value())
    else if (a === '--removal') { flags.removal = value(); if (!['strict', 'moderate'].includes(flags.removal)) throw new Error('--removal is strict or moderate') }
    else if (a.startsWith('--')) throw new Error(`unknown flag ${a}`)
    else flags.db = a
  }
  return flags
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const flags = parseArgs(process.argv.slice(2))
    if (!flags.db) throw new Error('usage: node scripts/translate-comments.mjs <comments.sqlite> --model <name> [--base-url …] [--key …] [--langs es,en,de,fr] [--universal] [--source-kind lichess] [--limit n] [--delay-ms ms] [--review file.jsonl] [--dry-run]')
    await translateComments({
      ...flags,
      baseUrl: flags.baseUrl ?? process.env.LLM_BASE_URL,
      model: flags.model ?? process.env.LLM_MODEL,
      key: flags.key ?? process.env.LLM_API_KEY,
      delayMs: flags.delayMs ?? 1000,
    })
  } catch (e) {
    console.error(e.message)
    process.exit(1)
  }
}
