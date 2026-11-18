// scripts/build-comment-db.mjs end to end on a one-game PGN: every comment keeps its ply and full move number.
import { spawnSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

// Vite 5 cannot resolve the node:sqlite builtin, so it is loaded with require.
const { DatabaseSync } = createRequire(import.meta.url)('node:sqlite')
const SCRIPT = new URL('./build-comment-db.mjs', import.meta.url).pathname
const PGN = `[Event "Test"]
[White "Paul Morphy"]
[Black "Duke Karl"]

1. e4 e5 2. Nf3 d6 3. d4 Bg4 4. dxe5 Bxf3 5. Qxf3 dxe5 6. Bc4 Nf6 7. Qb3 Qe7 8. Nc3
{The queen hits b7 and f7 at the same time and Black has to give up a pawn or block the files awkwardly.}
8... c6 9. Bg5 b5 10. Nxb5 cxb5 11. Bxb5+ Nbd7 12. O-O-O Rd8 1-0
`

// Needs the built library (pnpm build): the script imports ../dist/index.js.
const built = existsSync(new URL('../dist/index.js', import.meta.url))
let dir
let out

beforeAll(() => {
  if (!built) return
  dir = mkdtempSync(join(tmpdir(), 'comment-db-'))
  out = join(dir, 'out')
  writeFileSync(join(dir, 'games.pgn'), PGN)
  writeFileSync(join(dir, 'manifest.json'), JSON.stringify([{ file: 'games.pgn', title: 'Test studies', lang: 'en', kind: 'lichess' }]))
  const run = spawnSync(process.execPath, [SCRIPT, join(dir, 'manifest.json'), out], { encoding: 'utf8' })
  if (run.status !== 0) throw new Error(run.stderr || run.stdout)
})

afterAll(() => {
  if (dir) rmSync(dir, { recursive: true, force: true })
})

describe.skipIf(!built)('build-comment-db', () => {
  it('stores the full move number of each comment in comments.sqlite', () => {
    const db = new DatabaseSync(join(out, 'comments.sqlite'))
    const rows = db.prepare('SELECT ply, move_number, san FROM position_comments').all()
    db.close()
    expect(rows).toContainEqual({ ply: 15, move_number: 8, san: 'Nc3' })
    for (const r of rows) expect(r.move_number).toBe(Math.ceil(r.ply / 2))
  })

  it('writes the move next to the ply in the p/ shards', () => {
    const entries = readdirSync(join(out, 'p')).flatMap((f) => Object.values(JSON.parse(readFileSync(join(out, 'p', f), 'utf8'))).flat())
    expect(entries).toContainEqual(expect.objectContaining({ ply: 15, move: 8, san: 'Nc3' }))
    for (const e of entries) expect(e.move).toBe(Math.ceil(e.ply / 2))
  })
})
