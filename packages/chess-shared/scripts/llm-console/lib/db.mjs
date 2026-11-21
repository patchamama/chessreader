// The comments database (the shape of apps/api/migrations/005_position_comments.sql) through node:sqlite.
import { createRequire } from 'node:module'
// Loaded with require so bundlers that do not know the builtin (Vite) can still import this file.
const { DatabaseSync } = createRequire(import.meta.url)('node:sqlite')

/** Opens a database; read-only unless asked. `all`, `get` and `run` take positional parameters. */
export function openDb(path, { readOnly = true } = {}) {
  if (!path) throw Object.assign(new Error('no database set: choose one in the settings'), { status: 400 })
  const db = new DatabaseSync(path, { readOnly })
  db.exec('PRAGMA busy_timeout = 5000')
  return {
    all: (sql, ...params) => db.prepare(sql).all(...params),
    get: (sql, ...params) => db.prepare(sql).get(...params),
    run: (sql, ...params) => db.prepare(sql).run(...params),
    exec: (sql) => db.exec(sql),
    close: () => db.close(),
  }
}

/** Runs `fn(db)` on a read-only connection and closes it. */
export function withDb(path, fn, options) {
  const db = openDb(path, options)
  try { return fn(db) } finally { db.close() }
}
