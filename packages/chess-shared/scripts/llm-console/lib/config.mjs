// Settings of the console (a JSON file in the user's home) and its secrets (another file, mode 0600).
// A secret is never returned in clear: the API shows only whether it is set.
import { chmodSync, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

/** The models recommended for each task (shown with a ★). */
export const RECOMMENDED = { normalize: 'gpt-oss:20b', translate: 'translategemma:27b' }

export const DEFAULTS = {
  dbPath: '',
  reviewPath: '',
  logPath: '',
  ollamaUrl: 'http://127.0.0.1:11434',
  models: { ...RECOMMENDED },
  langs: ['es'],
  concurrency: 3,
  /** What the normalization may do with the moves of a comment: 'strict' rejects a rewrite that drops any move; 'moderate' lets it drop moves of later play (a "then/later" cue or a later move number). */
  removal: 'moderate',
  /** Pause the queue every `everyMin` minutes for `forMin` minutes (to let the GPU cool down); 0 = never. */
  pause: { everyMin: 0, forMin: 5 },
  /** An external model that can stand in for the local ones: { provider: 'openai'|'anthropic'|'openai-compatible', model, baseUrl }. The key is a secret. */
  external: { provider: '', model: '', baseUrl: '' },
  language: 'en',
}

export const configHome = () => process.env.LLM_CONSOLE_HOME || join(homedir(), '.local-llms-tasks')
const settingsFile = (home) => join(home, 'settings.json')
const secretsFile = (home) => join(home, 'secrets.json')

const readJson = (file) => { try { return JSON.parse(readFileSync(file, 'utf8')) } catch { return {} } }
function writeJson(file, data, mode) {
  mkdirSync(join(file, '..'), { recursive: true })
  const tmp = `${file}.${process.pid}.tmp`
  writeFileSync(tmp, JSON.stringify(data, null, 2), { mode })
  renameSync(tmp, file)
  if (mode) chmodSync(file, mode)
}

const merge = (base, patch) => {
  const out = { ...base }
  for (const [k, v] of Object.entries(patch ?? {})) out[k] = v && typeof v === 'object' && !Array.isArray(v) && typeof base[k] === 'object' && !Array.isArray(base[k]) ? merge(base[k], v) : v
  return out
}

/** The settings with defaults filled in; the review and log files default to the database's name. */
export function loadSettings(home = configHome()) {
  const s = merge(DEFAULTS, readJson(settingsFile(home)))
  if (process.env.LLM_CONSOLE_DB) s.dbPath = process.env.LLM_CONSOLE_DB
  const stem = s.dbPath.replace(/\.sqlite3?$/, '')
  if (!s.reviewPath && s.dbPath) s.reviewPath = `${stem}.review.jsonl`
  if (!s.logPath && s.dbPath) s.logPath = `${stem}.log`
  return s
}

const CHECKS = {
  concurrency: (v) => Number.isInteger(v) && v >= 1 && v <= 16,
  langs: (v) => Array.isArray(v) && v.length > 0 && v.every((l) => /^[a-z]{2}$/.test(l)),
  language: (v) => v === 'en' || v === 'es',
  removal: (v) => v === 'strict' || v === 'moderate',
  ollamaUrl: (v) => typeof v === 'string' && /^https?:\/\//.test(v),
}

/** Validates and saves a patch of the settings; returns the new settings. Throws on an invalid value. */
export function saveSettings(patch, home = configHome()) {
  for (const [k, check] of Object.entries(CHECKS)) if (k in patch && !check(patch[k])) throw Object.assign(new Error(`invalid ${k}`), { status: 400 })
  if (patch.pause && !(Number.isFinite(patch.pause.everyMin ?? 0) && Number.isFinite(patch.pause.forMin ?? 1) && (patch.pause.everyMin ?? 0) >= 0 && (patch.pause.forMin ?? 1) >= 1)) {
    throw Object.assign(new Error('invalid pause'), { status: 400 })
  }
  const stored = readJson(settingsFile(home))
  writeJson(settingsFile(home), merge(stored, patch))
  return loadSettings(home)
}

const SECRET_NAMES = ['openai', 'anthropic', 'openai-compatible', 'github', 'lichess']

/** The value of a secret: the console's file, else the usual environment variable. Never sent to the browser. */
export function getSecret(name, home = configHome()) {
  const env = { openai: 'OPENAI_API_KEY', anthropic: 'ANTHROPIC_API_KEY', github: 'GITHUB_TOKEN', lichess: 'LICHESS_TOKEN' }[name]
  return readJson(secretsFile(home))[name] || (env ? process.env[env] : '') || ''
}

export function setSecret(name, value, home = configHome()) {
  if (!SECRET_NAMES.includes(name)) throw Object.assign(new Error('unknown secret'), { status: 400 })
  const all = readJson(secretsFile(home))
  if (value) all[name] = value
  else delete all[name]
  writeJson(secretsFile(home), all, 0o600)
}

/** Which secrets are available (never their values). */
export function secretStatus(home = configHome()) {
  return Object.fromEntries(SECRET_NAMES.map((n) => [n, !!getSecret(n, home)]))
}

export const settingsExist = (home = configHome()) => existsSync(settingsFile(home))
