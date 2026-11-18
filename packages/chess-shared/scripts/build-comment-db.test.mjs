// scripts/build-comment-db.mjs end to end on a one-game PGN: every comment keeps its ply and full move number.
import { spawnSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
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

// A book listed as the resources repository lists it (books/manifest.json: id → books/text/<id>.txt),
// whose 9th move is a misprint fixed by an errata entry.
const BOOK = [
  'Opera Games',
  'Game 1',
  'P. Morphy – Duke of Brunswick and Count Isouard',
  '1 e4 e5 2 Nf3 d6 3 d4 Bg4 4 dxe5 Bxf3 5 Qxf3 dxe5 6 Bc4 Nf6 7 Qb3 Qe7 8 Nc3 c6 9 Bf4!?',
  'White develops with tempo and keeps the black queen tied to the defence of the bishop on f8.',
  '9...b5 10 Nxb5 cxb5 11 Bxb5+ Nbd7 12 O-O-O Rd8',
  'Every white piece now takes part in the attack while the black kingside pieces are still asleep.',
].join('\n')
const ERRATUM = {
  id: 'opera-games-1-0', book: { title: 'Opera Games' }, chapter: 1, gameIndex: 0,
  game: { label: 'Game 1', white: 'P. Morphy', black: 'Duke of Brunswick', number: 1 },
  original: { moves: ['e4', 'e5', 'Nf3', 'd6', 'd4', 'Bg4', 'dxe5', 'Bxf3', 'Qxf3', 'dxe5', 'Bc4', 'Nf6', 'Qb3', 'Qe7', 'Nc3', 'c6', 'Bf4!?'], text: '9 Bf4!?' },
  corrected: { moves: ['e4', 'e5', 'Nf3', 'd6', 'd4', 'Bg4', 'dxe5', 'Bxf3', 'Qxf3', 'dxe5', 'Bc4', 'Nf6', 'Qb3', 'Qe7', 'Nc3', 'c6', 'Bg5'] },
  changes: [{ ply: 17, from: 'Bf4!?', to: 'Bg5', source: 'online' }],
  createdAt: '2026-11-18T10:00:00Z', appVersion: '0.106.6',
}

describe.skipIf(!built)('build-comment-db with errata', () => {
  let repo
  const build = (args) => {
    const out = join(repo, `out-${args.length}`)
    const run = spawnSync(process.execPath, [SCRIPT, join(repo, 'books', 'manifest.json'), out, ...args], { encoding: 'utf8' })
    if (run.status !== 0) throw new Error(run.stderr || run.stdout)
    const db = new DatabaseSync(join(out, 'comments.sqlite'))
    const games = db.prepare('SELECT pgn FROM comment_games').all()
    const comments = db.prepare('SELECT ply, move_number, san FROM position_comments ORDER BY ply').all()
    db.close()
    return { out, games, comments, log: run.stdout }
  }

  beforeAll(() => {
    if (!built) return
    repo = mkdtempSync(join(tmpdir(), 'comment-db-errata-'))
    mkdirSync(join(repo, 'books', 'text'), { recursive: true })
    mkdirSync(join(repo, 'errata', 'opera-games'), { recursive: true })
    writeFileSync(join(repo, 'books', 'text', 'opera-games.txt'), BOOK)
    writeFileSync(join(repo, 'books', 'manifest.json'), JSON.stringify([{ id: 'opera-games', title: 'Opera Games', author: 'P. Morphy', lang: 'en' }]))
    writeFileSync(join(repo, 'errata', 'opera-games', '1-0.json'), JSON.stringify(ERRATUM))
    writeFileSync(join(repo, 'errata', 'index.json'), JSON.stringify({ version: 1, entries: [{ book: 'opera-games', chapter: 1, gameIndex: 0, path: 'opera-games/1-0.json' }] }))
  })

  afterAll(() => {
    if (repo) rmSync(repo, { recursive: true, force: true })
  })

  it('reads a book listed by id from text/<id>.txt, as printed without --errata', () => {
    const { games, comments } = build([])
    expect(games).toHaveLength(1)
    expect(games[0].pgn).toContain('9. Bf4')
    expect(comments).toContainEqual({ ply: 17, move_number: 9, san: 'Bf4' })
  })

  it('applies the errata to the main line before extracting the comments', () => {
    const { out, games, comments, log } = build(['--errata', join(repo, 'errata')])
    expect(games[0].pgn).toContain('9. Bg5')
    expect(games[0].pgn).not.toContain('Bf4')
    expect(comments).toContainEqual({ ply: 17, move_number: 9, san: 'Bg5' })
    expect(comments.some((c) => c.san === 'Bf4')).toBe(false)
    for (const c of comments) expect(c.move_number).toBe(Math.ceil(c.ply / 2))
    const index = JSON.parse(readFileSync(join(out, 'index.json'), 'utf8'))
    expect(index.errata).toBe(1)
    expect(log).toMatch(/1 errata/)
  })
})
