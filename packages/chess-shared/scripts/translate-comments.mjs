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

/** The problems of a rewritten comment; [] when it may be stored. */
export function validateRewrite(original, proposal) {
  const problems = []
  const text = proposal.trim()
  if (!text) return ['the proposal is empty']
  if (text.length > 3 * Math.max(original.trim().length, 1)) problems.push('the proposal is more than 3 times longer than the original')
  const kept = new Set(moveKeys(text))
  const missing = [...original.matchAll(MOVE_RE)].filter((m) => !kept.has(moveKeys(m[0])[0])).map((m) => m[0])
  if (missing.length) problems.push(`moves missing from the proposal: ${[...new Set(missing)].join(', ')}`)
  // Stricter than the app's check: an unattended batch must not invent moves either.
  const known = new Set(moveKeys(original))
  const added = [...text.matchAll(MOVE_RE)].filter((m) => !known.has(moveKeys(m[0])[0])).map((m) => m[0])
  if (added.length) problems.push(`moves added to the proposal: ${[...new Set(added)].join(', ')}`)
  return problems
}

/** One chat completion; retries 429 and 5xx with backoff. */
async function complete(prompt, { baseUrl, model, key, fetchImpl, sleep, retries = 3 }) {
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
  for (const l of langs) if (!LANGS[l]) throw new Error(`unsupported language: ${l} (use ${TARGET_LANGS.join(', ')})`)
  if (!opts.model) throw new Error('a model is needed (--model or LLM_MODEL)')
  const reviewPath = opts.review ?? `${opts.db}.review.jsonl`
  const llm = { baseUrl: opts.baseUrl ?? 'http://localhost:11434/v1', model: opts.model, key: opts.key, fetchImpl, sleep }
  const db = new DatabaseSync(opts.db)
  const where = opts.sourceKind ? 'WHERE s.kind = ?' : ''
  const hasMoveNumber = db.prepare('PRAGMA table_info(position_comments)').all().some((c) => c.name === 'move_number')
  const comments = db.prepare(`SELECT c.id, c.text, c.lang, c.position, c.ply, c.san${hasMoveNumber ? ', c.move_number' : ''}
    FROM position_comments c JOIN comment_games g ON g.id = c.game_id JOIN comment_sources s ON s.id = g.source_id ${where} ORDER BY c.id`)
    .all(...(opts.sourceKind ? [opts.sourceKind] : []))
  const existing = db.prepare('SELECT text FROM comment_translations WHERE comment_id = ? AND lang = ?')
  const insert = db.prepare('INSERT OR REPLACE INTO comment_translations (comment_id, lang, text) VALUES (?, ?, ?)')
  const summary = { comments: 0, accepted: 0, written: 0, rejected: 0, failed: 0, skipped: 0 }
  let calls = 0

  const propose = async (c, action, lang, prompt) => {
    if (calls++ > 0 && opts.delayMs) await sleep(opts.delayMs)
    const line = { id: c.id, lang, action, original: c.text, proposal: null, problems: [], model: llm.model, status: 'failed' }
    try {
      const answer = await complete(prompt, llm)
      line.model = answer.model
      line.proposal = parseAiText(answer.content)
      line.problems = validateRewrite(c.text, line.proposal)
      line.status = line.problems.length ? 'rejected' : 'accepted'
    } catch (e) {
      line.problems = [e.message]
    }
    if (opts.dryRun) line.dryRun = true
    appendFileSync(reviewPath, JSON.stringify(line) + '\n')
    summary[line.status === 'accepted' ? 'accepted' : line.status]++
    if (line.status !== 'accepted') return null
    if (!opts.dryRun) { insert.run(c.id, lang, line.proposal); summary.written++ }
    return line.proposal
  }

  try {
    for (const c of comments) {
      const own = existing.get(c.id, c.lang)?.text
      const todo = langs.filter((l) => l !== c.lang && !existing.get(c.id, l))
      const universalDue = opts.universal && !own
      if (!todo.length && !universalDue) { summary.skipped++; continue }
      if (opts.limit && summary.comments >= opts.limit) break
      summary.comments++
      const input = { text: c.text, lang: c.lang, fen: `${c.position} 0 1`, move: moveLabel(c) }
      let source = opts.universal ? own ?? null : null
      if (universalDue) source = await propose(c, 'universal', c.lang, universalPrompt(input))
      const from = source ? { ...input, text: source } : input
      for (const lang of todo) await propose(c, 'translate', lang, translatePrompt(from, lang))
      log(`#${c.id}: ${summary.accepted} accepted, ${summary.rejected} rejected, ${summary.failed} failed so far`)
    }
  } finally {
    db.close()
  }
  log(`${summary.comments} comments: ${summary.accepted} accepted (${summary.written} written${opts.dryRun ? ', dry run' : ''}), ${summary.rejected} rejected, ${summary.failed} failed, ${summary.skipped} already done; review: ${reviewPath}`)
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
