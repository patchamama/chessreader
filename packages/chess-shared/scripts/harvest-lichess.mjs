// Harvests human-annotated games from public Lichess studies and broadcasts,
// keeps the ones with enough human commentary, and writes them as PGN sources
// for build-comment-db.mjs (kind "lichess").
//
// Usage:
//   node scripts/harvest-lichess.mjs <config.json> <out-dir>
//
// config.json (see lichess-sources.example.json):
//   { "users": ["name" | { "id": "name", "lang": "en" }],      every public study of a user
//     "studies": ["8-char id" | { "id": "…", "lang": "es" }],    one public study
//     "broadcasts": ["8-char tournament id" | { … }],            every round of a broadcast
//     "minComments": 3,      human comments (≥ minCommentChars) a game needs
//     "minCommentChars": 20, a shorter comment is kept in the PGN but not counted
//     "minPlies": 20,        main-line half-moves a game needs
//     "maxGames": 500,       stop once this many games are kept
//     "lang": "en",          default language of the comments
//     "delayMs": 2000 }      pause between two requests
//
// Writes, under <out-dir>/lichess/:
//   <source>.pgn     kept games (study-<id>, user-<name>, broadcast-<id>), with clock/eval
//                    commands and engine-only annotations removed
//   harvest.json     every kept game with its study/chapter URL and author (attribution),
//                    every dropped game with the reason, and each source's outcome
//   manifest.json    entries for build-comment-db.mjs: node scripts/build-comment-db.mjs <out>/lichess/manifest.json <db-out>
//
// Lichess API rules (https://lichess.org/api): only public data, no token; one
// request at a time; after an HTTP 429 wait at least a minute before retrying.
// Lichess studies are their authors' work: keep the study URL and author with
// every comment you publish.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

export const USER_AGENT = 'chessreader-harvest (sample data tool)'
const API = 'https://lichess.org'
const EXPORT_FLAGS = 'clocks=false&comments=true&variations=true'
const LICENCE = 'Lichess studies and broadcast annotations are the work of their authors (the study owner or annotator). '
  + 'Publish a comment only with its study/chapter URL and author, and remove a source if its author asks.'

const COMMENT = /\{([^}]*)\}/g
const COMMAND = /\[%[^\]]*\]/g
// The annotations of Lichess's computer analysis: "Mistake. Nf1 was best."
const ENGINE_ONLY = /^(?:Inaccuracy|Mistake|Blunder)\.\s+\S+\s+was best\.?$/i

/** The games of a PGN export (Lichess separates them with blank lines before [Event). */
export function splitPgnGames(text) {
  return text.replace(/\r/g, '').split(/\n\s*\n(?=\[Event )/).map((g) => g.trim()).filter((g) => g.startsWith('['))
}

/** The PGN tags of a game. */
export function headersOf(pgn) {
  const tags = {}
  for (const m of pgn.matchAll(/^\[(\w+)\s+"((?:[^"\\]|\\.)*)"\]\s*$/gm)) tags[m[1]] = m[2]
  return tags
}

const movetextOf = (pgn) => {
  const i = pgn.search(/\n\s*\n/)
  return i < 0 ? (pgn.startsWith('[') ? '' : pgn) : pgn.slice(i).trim()
}

/** A comment without its [%…] commands; '' when nothing human is left. */
function humanText(raw) {
  const text = raw.replace(COMMAND, ' ').replace(/\s+/g, ' ').trim()
  if (!/\p{L}{2,}/u.test(text) || ENGINE_ONLY.test(text)) return ''
  return text
}

/** The human {comments} of a game, in order: no clocks, evals, arrows or engine-only annotations. */
export function humanComments(pgn) {
  return [...movetextOf(pgn).matchAll(COMMENT)].map((m) => humanText(m[1])).filter(Boolean)
}

const SAN = /^(?:[KQRBN]?[a-h]?[1-8]?x?[a-h][1-8](?:=?[QRBN])?|O-O(?:-O)?)[+#]?[!?]*$/

/** Half-moves of the main line (comments, variations, NAGs and move numbers ignored). */
export function countPlies(movetext) {
  let text = movetext.replace(COMMENT, ' ').replace(/;[^\n]*/g, ' ')
  for (let prev = ''; prev !== text;) { prev = text; text = text.replace(/\([^()]*\)/g, ' ') }
  return text.replace(/\$\d+/g, ' ').replace(/\d+\.(?:\.\.)?/g, ' ').split(/\s+/).filter((t) => SAN.test(t)).length
}

/** The game with its [%…] commands and engine-only or empty comments removed; tags as they were. */
export function cleanGamePgn(pgn) {
  const i = pgn.search(/\n\s*\n/)
  const head = i < 0 ? '' : pgn.slice(0, i).trim()
  const moves = (i < 0 ? pgn : pgn.slice(i))
    .replace(COMMENT, (_, raw) => { const t = humanText(raw); return t ? `{ ${t} }` : ' ' })
    .replace(/[ \t]+/g, ' ').replace(/ *\n */g, '\n').trim()
  return head ? `${head}\n\n${moves}` : moves
}

/** Whether a game has enough human commentary: { keep, reason?, comments, plies }. */
export function filterGame(pgn, { minComments = 3, minPlies = 20, minCommentChars = 20 } = {}) {
  const comments = humanComments(pgn).filter((c) => c.length >= minCommentChars).length
  const plies = countPlies(movetextOf(pgn))
  if (comments < minComments) return { keep: false, reason: `comments ${comments} < ${minComments}`, comments, plies }
  if (plies < minPlies) return { keep: false, reason: `plies ${plies} < ${minPlies}`, comments, plies }
  return { keep: true, comments, plies }
}

/** Study id, URLs, chapter and author of a game, from its Lichess tags. */
export function attributionOf(tags, fallbackAuthor = null) {
  const url = tags.ChapterURL || tags.Site || ''
  const study = /lichess\.org\/study\/([A-Za-z0-9]{8})(?:\/([A-Za-z0-9]{8}))?/.exec(url)
  const annotator = /lichess\.org\/@\/([\w-]+)/.exec(tags.Annotator ?? '')
  const [studyName, chapterName] = (tags.Event ?? '').split(/:\s(.*)/s)
  return {
    studyId: study?.[1] ?? null,
    studyUrl: study ? `${API}/study/${study[1]}` : null,
    studyName: tags.StudyName ?? (studyName || null),
    chapter: tags.ChapterName ?? (chapterName || null),
    chapterUrl: study?.[2] ? `${API}/study/${study[1]}/${study[2]}` : url || null,
    author: annotator?.[1] ?? (tags.Annotator || fallbackAuthor),
  }
}

/** GET a public PGN export, sequentially, retrying 429 after ≥ 1 minute and 5xx with backoff. */
export async function politeFetch(url, { fetchImpl = fetch, sleep, log = console.log, retries = 4 } = {}) {
  const headers = { 'User-Agent': USER_AGENT, Accept: 'application/x-chess-pgn' }
  for (let attempt = 0; ; attempt++) {
    const res = await fetchImpl(url, { headers, signal: AbortSignal.timeout(300_000) })
    if (res.status === 200) return res.text()
    if (attempt >= retries || (res.status !== 429 && res.status < 500)) throw new Error(`HTTP ${res.status}`)
    const wait = res.status === 429 ? 60_000 * (attempt + 1) : 5_000 * 2 ** attempt
    log(`  HTTP ${res.status}, waiting ${wait / 1000} s`)
    await sleep(wait)
  }
}

const entry = (e) => (typeof e === 'string' ? { id: e } : e)

/** The sources of a config, in order: studies, users, broadcasts. */
export function sourcesOf(config) {
  const lang = config.lang ?? 'en'
  const make = (kind, e) => {
    const { id, ...rest } = entry(e)
    if (!/^[\w-]+$/.test(id ?? '')) throw new Error(`invalid ${kind} id: ${JSON.stringify(e)}`)
    const path = kind === 'study' ? `/api/study/${id}.pgn` : kind === 'user' ? `/api/study/by/${id}/export.pgn` : `/api/broadcast/${id}.pgn`
    return { kind, id, lang, ...rest, source: `${kind}-${id}`, url: `${API}${path}?${EXPORT_FLAGS}` }
  }
  return [
    ...(config.studies ?? []).map((e) => make('study', e)),
    ...(config.users ?? []).map((e) => make('user', e)),
    ...(config.broadcasts ?? []).map((e) => make('broadcast', e)),
  ]
}

/** Runs a harvest; returns { kept, dropped, comments, sources }. */
export async function harvest(config, { out, fetchImpl = fetch, sleep = (ms) => new Promise((r) => setTimeout(r, ms)), log = console.log } = {}) {
  const opts = { minComments: config.minComments ?? 3, minPlies: config.minPlies ?? 20, minCommentChars: config.minCommentChars ?? 20 }
  const maxGames = config.maxGames ?? 500
  const delayMs = config.delayMs ?? 2000
  const dir = join(out, 'lichess')
  mkdirSync(dir, { recursive: true })
  const report = { generated: new Date().toISOString(), tool: USER_AGENT, licence: LICENCE, filter: { ...opts, maxGames }, sources: [], games: [], dropped: [] }
  const manifest = []
  let requests = 0
  let comments = 0

  for (const src of sourcesOf(config)) {
    if (report.games.length >= maxGames) break
    if (requests++ > 0) await sleep(delayMs)
    log(`${src.source}: ${src.url}`)
    let text
    try {
      text = await politeFetch(src.url, { fetchImpl, sleep, log })
    } catch (e) {
      log(`  skipped: ${e.message}`)
      report.sources.push({ source: src.source, url: src.url, error: e.message })
      continue
    }
    const kept = []
    let dropped = 0
    for (const raw of splitPgnGames(text)) {
      if (report.games.length >= maxGames) break
      const tags = headersOf(raw)
      const who = attributionOf(tags, src.kind === 'user' ? src.id : null)
      const verdict = filterGame(raw, opts)
      if (!verdict.keep) {
        dropped++
        report.dropped.push({ source: src.source, chapter: who.chapter, url: who.chapterUrl, reason: verdict.reason })
        continue
      }
      kept.push(cleanGamePgn(raw))
      comments += verdict.comments
      report.games.push({ source: src.source, file: `${src.source}.pgn`, ...who, comments: verdict.comments, plies: verdict.plies })
    }
    report.sources.push({ source: src.source, url: src.url, kept: kept.length, dropped })
    log(`  kept ${kept.length}, dropped ${dropped}`)
    if (!kept.length) continue
    writeFileSync(join(dir, `${src.source}.pgn`), kept.join('\n\n') + '\n')
    const first = report.games.find((g) => g.source === src.source)
    const title = src.title ?? (src.kind === 'study' ? `Lichess study: ${first.studyName ?? src.id}`
      : src.kind === 'user' ? `Lichess studies by ${src.id}` : `Lichess broadcast: ${first.studyName ?? src.id}`)
    manifest.push({ file: `${src.source}.pgn`, title, author: src.kind === 'user' ? src.id : first.author ?? null, lang: src.lang, kind: 'lichess', url: src.url.split('?')[0] })
  }

  writeFileSync(join(dir, 'harvest.json'), JSON.stringify(report, null, 1))
  writeFileSync(join(dir, 'manifest.json'), JSON.stringify(manifest, null, 1))
  const summary = { kept: report.games.length, dropped: report.dropped.length, comments, sources: report.sources.length }
  log(`kept ${summary.kept} games (${comments} counted comments), dropped ${summary.dropped}, from ${summary.sources} sources`)
  return summary
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [configPath, outDir] = process.argv.slice(2)
  if (!configPath || !outDir) {
    console.error('usage: node scripts/harvest-lichess.mjs <config.json> <out-dir>')
    process.exit(1)
  }
  harvest(JSON.parse(readFileSync(configPath, 'utf8')), { out: outDir }).catch((e) => {
    console.error(e.message)
    process.exit(1)
  })
}
