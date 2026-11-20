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

// The browser's list of every comment (comments-index/): pages of comments with
// their FEN, source and the book chapter they were read from.
describe.skipIf(!built)('build-comment-db comments index', () => {
  let repo
  let out
  beforeAll(() => {
    if (!built) return
    repo = mkdtempSync(join(tmpdir(), 'comment-db-index-'))
    out = join(repo, 'out')
    mkdirSync(join(repo, 'books', 'text'), { recursive: true })
    // A title page, an empty form-feed part (not counted), then the game: chapter 2, as the game database counts.
    writeFileSync(join(repo, 'books', 'text', 'opera-games.txt'), `Opera Games\nA title page\f\f${BOOK}`)
    writeFileSync(join(repo, 'books', 'manifest.json'), JSON.stringify([{ id: 'opera-games', title: 'Opera Games', author: 'P. Morphy', lang: 'en' }]))
    writeFileSync(join(repo, 'games.pgn'), PGN)
    writeFileSync(join(repo, 'books', 'all.json'), JSON.stringify([
      { id: 'opera-games', title: 'Opera Games', author: 'P. Morphy', lang: 'en' },
      { file: '../games.pgn', title: 'Test studies', lang: 'en', kind: 'lichess' },
    ]))
    const run = spawnSync(process.execPath, [SCRIPT, join(repo, 'books', 'all.json'), out], { encoding: 'utf8' })
    if (run.status !== 0) throw new Error(run.stderr || run.stdout)
  })
  afterAll(() => {
    if (repo) rmSync(repo, { recursive: true, force: true })
  })

  const pages = () => readdirSync(join(out, 'comments-index')).filter((f) => /^\d+\.json$/.test(f)).sort()
  const entries = () => pages().flatMap((f) => JSON.parse(readFileSync(join(out, 'comments-index', f), 'utf8')).comments)

  it('writes meta.json with the total, the pages and the sources', () => {
    const meta = JSON.parse(readFileSync(join(out, 'comments-index', 'meta.json'), 'utf8'))
    const db = new DatabaseSync(join(out, 'comments.sqlite'))
    const total = db.prepare('SELECT COUNT(*) AS n FROM position_comments').get().n
    db.close()
    expect(total).toBeGreaterThan(1)
    expect(meta).toMatchObject({ version: 1, total, pages: pages().length, pageSize: 2000 })
    expect(meta.sources['1']).toMatchObject({ kind: 'book', title: 'Opera Games', author: 'P. Morphy', lang: 'en', book: 'opera-games' })
    expect(meta.sources['2']).toMatchObject({ kind: 'lichess', title: 'Test studies', book: null })
    expect(pages()).toEqual(['0.json'])
  })

  it('lists every comment with its full FEN, move, game and the chapter it was read from', () => {
    const list = entries()
    const db = new DatabaseSync(join(out, 'comments.sqlite'))
    const rows = db.prepare('SELECT id, hash, position, chapter, game_id FROM position_comments ORDER BY id').all()
    db.close()
    expect(list.map((e) => e.id)).toEqual(rows.map((r) => r.id))
    const book = list.find((e) => e.source === 1 && e.san === 'Bf4')
    expect(book).toMatchObject({ ply: 17, move: 9, chapter: 2, lang: 'en', white: expect.anything() })
    expect(book.fen.split(' ')).toHaveLength(6)
    expect(book.fen.startsWith(rows.find((r) => r.id === book.id).position)).toBe(true)
    expect(book.hash).toMatch(/^[0-9a-f]{16}$/)
    const study = list.find((e) => e.source === 2)
    expect(study.chapter).toBeNull()
    expect(rows.find((r) => r.id === book.id).chapter).toBe(2)
    expect(rows.find((r) => r.id === study.id).chapter).toBeNull()
  })

  it('keeps the book id of a source in comment_sources', () => {
    const db = new DatabaseSync(join(out, 'comments.sqlite'))
    const rows = db.prepare('SELECT id, book_id FROM comment_sources ORDER BY id').all()
    db.close()
    expect(rows).toEqual([{ id: 1, book_id: 'opera-games' }, { id: 2, book_id: null }])
  })
})

// Lichess sources (.pgn) are read straight from the moves: every human comment of
// the main line and the variations lands on its position.
const STUDY = `[Event "Invented study: Open files"]
[White "Invented, White"]
[Black "Invented, Black"]
[Result "*"]

{ An invented game about the fight for the open file in the Spanish. }
1. e4 e5 2. Nf3 Nc6 3. Bb5 { [%clk 1:30:00] The Spanish: the bishop presses on the knight that defends e5. [%cal Gb5c6] }
3... a6 (3... Nf6 { The Berlin: Black counterattacks the pawn on e4 at once. } 4. O-O
  (4. d3 { A quiet move that keeps the centre closed and the game slow. }) 4... Nxe4)
4. Ba4 { [%eval 0.3] } Nf6 { Mistake. Nf1 was best. } 5. O-O Be7 6. Re1 b5 7. Bb3 d6 { Every piece keeps its natural square here. } *

[Event "Invented study: Too short"]
[White "A"]
[Black "B"]

1. d4 { A queen's pawn opening that leads to a slow game. } d5 *
`

describe.skipIf(!built)('build-comment-db PGN sources', () => {
  let repo
  let out
  beforeAll(() => {
    if (!built) return
    repo = mkdtempSync(join(tmpdir(), 'comment-db-pgn-'))
    out = join(repo, 'out')
    writeFileSync(join(repo, 'study.pgn'), STUDY)
    writeFileSync(join(repo, 'manifest.json'), JSON.stringify([{ file: 'study.pgn', title: 'Invented study', lang: 'en', kind: 'lichess' }]))
    const run = spawnSync(process.execPath, [SCRIPT, join(repo, 'manifest.json'), out], { encoding: 'utf8' })
    if (run.status !== 0) throw new Error(run.stderr || run.stdout)
  })
  afterAll(() => {
    if (repo) rmSync(repo, { recursive: true, force: true })
  })

  it('lands every human comment, variations and the leading one included, with ply, move, SAN and game', () => {
    const db = new DatabaseSync(join(out, 'comments.sqlite'))
    const rows = db.prepare('SELECT ply, move_number, san, game_id, text FROM position_comments ORDER BY id').all()
    db.close()
    expect(rows.map((r) => [r.ply, r.move_number, r.san])).toEqual([[0, 0, ''], [5, 3, 'Bb5'], [6, 3, 'Nf6'], [7, 4, 'd3'], [14, 7, 'd6']])
    expect(rows.every((r) => r.game_id === '1-1')).toBe(true)
    expect(rows[1].text).toBe('The Spanish: the bishop presses on the knight that defends e5.')
    expect(rows.map((r) => r.text).join(' ')).not.toMatch(/\[%|Mistake\./)
  })

  it('writes the shards and the index with the position hash of each comment', () => {
    const shard = readdirSync(join(out, 'p')).flatMap((f) => Object.entries(JSON.parse(readFileSync(join(out, 'p', f), 'utf8'))))
    const list = JSON.parse(readFileSync(join(out, 'comments-index', '0.json'), 'utf8')).comments
    expect(list).toHaveLength(5)
    const berlin = list.find((e) => e.san === 'Nf6')
    expect(berlin).toMatchObject({ ply: 6, move: 3, game: '1-1', source: 1, white: 'Invented, White', black: 'Invented, Black', chapter: null })
    expect(berlin.fen.startsWith('r1bqkb1r/pppp1ppp/2n2n2/1B2p3/4P3/5N2/PPPP1PPP/RNBQK2R w KQkq -')).toBe(true)
    const [hash, entries] = shard.find(([, es]) => es.some((e) => e.id === berlin.id))
    expect(hash).toBe(berlin.hash)
    expect(hash.slice(0, 2)).toBe(readdirSync(join(out, 'p')).find((f) => JSON.parse(readFileSync(join(out, 'p', f), 'utf8'))[hash]).slice(0, 2))
    expect(entries.find((e) => e.id === berlin.id)).toMatchObject({ ply: 6, move: 3, san: 'Nf6', game: '1-1', source: 1, lang: 'en' })
  })

  it('exports the game with its comments and skips a game shorter than 10 plies', () => {
    expect(readdirSync(join(out, 'g'))).toEqual(['1-1.json'])
    const game = JSON.parse(readFileSync(join(out, 'g', '1-1.json'), 'utf8'))
    expect(game).toMatchObject({ id: '1-1', source: 1, white: 'Invented, White', black: 'Invented, Black' })
    expect(game.pgn).toContain('{ The Spanish: the bishop presses on the knight that defends e5. }')
    expect(game.pgn).toContain('(3... Nf6')
    expect(game.pgn).not.toMatch(/\[%|Mistake\./)
  })
})

// Books keep the recogniser path: these are the outputs the script wrote for this
// book before PGN sources were read from the moves (index.json aside, which
// carries the build time). A recogniser change that alters them is a real change:
// rebuild with the script and update them deliberately.
describe.skipIf(!built)('build-comment-db book outputs', () => {
  let repo
  let out
  beforeAll(() => {
    if (!built) return
    repo = mkdtempSync(join(tmpdir(), 'comment-db-book-'))
    out = join(repo, 'out')
    mkdirSync(join(repo, 'books', 'text'), { recursive: true })
    writeFileSync(join(repo, 'books', 'text', 'opera-games.txt'), `Opera Games\nA title page\f\f${BOOK.replace('9 Bf4!?', '9 Bg5')}`)
    writeFileSync(join(repo, 'books', 'manifest.json'), JSON.stringify([{ id: 'opera-games', title: 'Opera Games', author: 'P. Morphy', lang: 'en' }]))
    const run = spawnSync(process.execPath, [SCRIPT, join(repo, 'books', 'manifest.json'), out], { encoding: 'utf8' })
    if (run.status !== 0) throw new Error(run.stderr || run.stdout)
  })
  afterAll(() => {
    if (repo) rmSync(repo, { recursive: true, force: true })
  })

  const file = (path) => readFileSync(join(out, path), 'utf8')
  const TEXT = 'White develops with tempo and keeps the black queen tied to the defence of the bishop on f8.'
  const SOURCES = { 1: { kind: 'book', title: 'Opera Games', author: 'P. Morphy', lang: 'en', priority: 1, book: 'opera-games', comments: 1 } }

  it('writes the same shard, game and comments index bytes as before', () => {
    expect(readdirSync(join(out, 'p'))).toEqual(['f2.json'])
    expect(file('p/f2.json')).toBe(JSON.stringify({ f28f488faf834e29: [{ id: 1, text: TEXT, lang: 'en', game: '1-1', ply: 17, move: 9, san: 'Bg5', source: 1, label: 'P. Morphy – Duke' }] }))
    expect(file('g/1-1.json')).toBe(JSON.stringify({ id: '1-1', source: 1, white: 'P. Morphy', black: 'Duke',
      pgn: '1. e4 e5 2. Nf3 d6 3. d4 Bg4 4. dxe5 Bxf3 5. Qxf3 dxe5 6. Bc4 Nf6 7. Qb3 Qe7 8. Nc3 c6 9. Bg5 b5 10. Nxb5 cxb5 11. Bxb5+ Nbd7 12. O-O-O Rd8' }))
    expect(file('comments-index/0.json')).toBe(JSON.stringify({ page: 0, comments: [{ id: 1, hash: 'f28f488faf834e29',
      fen: 'rn2kb1r/pp2qppp/2p2n2/4p1B1/2B1P3/1QN5/PPP2PPP/R3K2R b KQkq - 0 1', text: TEXT, lang: 'en', ply: 17, move: 9, san: 'Bg5',
      game: '1-1', source: 1, label: 'P. Morphy – Duke', white: 'P. Morphy', black: 'Duke', chapter: 2 }] }))
    expect(file('comments-index/meta.json')).toBe(JSON.stringify({ version: 1, total: 1, pages: 1, pageSize: 2000, page: 'comments-index/<n>.json', sources: SOURCES }, null, 1))
    const index = JSON.parse(file('index.json'))
    expect(Object.keys(index)).toEqual(['version', 'built', 'hash', 'shard', 'games', 'minPly', 'total', 'errata', 'sources'])
    expect({ ...index, built: null }).toEqual({ version: 1, built: null, hash: 'fnv1a64(fen without move counters)', shard: 'p/<first 2 hex>.json',
      games: 'g/<id>.json', minPly: 8, total: 1, errata: 0, sources: SOURCES })
  })
})

// Translations written by translate-comments.mjs into comments.sqlite survive a
// rebuild and reach the static outputs, so a deploy without a backend can show
// the reader's language.
describe.skipIf(!built)('build-comment-db translations', () => {
  let repo
  const build = (out, extra = []) => {
    const run = spawnSync(process.execPath, [SCRIPT, join(repo, 'manifest.json'), out, ...extra], { encoding: 'utf8' })
    if (run.status !== 0) throw new Error(run.stderr || run.stdout)
    return run.stdout
  }
  const translate = (out) => {
    const db = new DatabaseSync(join(out, 'comments.sqlite'))
    const spanish = db.prepare("SELECT id FROM position_comments WHERE san = 'Bb5'").get()
    db.prepare('INSERT INTO comment_translations (comment_id, lang, text) VALUES (?, ?, ?)').run(spanish.id, 'es', 'La española: el alfil presiona al caballo que defiende e5.')
    db.prepare('INSERT INTO comment_translations (comment_id, lang, text) VALUES (?, ?, ?)').run(spanish.id, 'de', 'Spanisch: Der Läufer drückt auf den Springer, der e5 deckt.')
    db.close()
  }
  const entry = (out, path) => {
    const p = JSON.parse(readFileSync(join(out, path), 'utf8'))
    return (p.comments ?? Object.values(p).flat()).find((e) => e.san === 'Bb5')
  }
  const shardOf = (out) => `p/${entry(out, 'comments-index/0.json').hash.slice(0, 2)}.json`

  beforeAll(() => {
    if (!built) return
    repo = mkdtempSync(join(tmpdir(), 'comment-db-tr-'))
    writeFileSync(join(repo, 'study.pgn'), STUDY)
    writeFileSync(join(repo, 'manifest.json'), JSON.stringify([{ file: 'study.pgn', title: 'Invented study', lang: 'en', kind: 'lichess' }]))
  })
  afterAll(() => {
    if (repo) rmSync(repo, { recursive: true, force: true })
  })

  it('writes no translations field when there are none', () => {
    const out = join(repo, 'plain')
    build(out)
    expect(entry(out, shardOf(out))).not.toHaveProperty('translations')
    expect(entry(out, 'comments-index/0.json')).not.toHaveProperty('translations')
  })

  it('keeps the translations of the out-dir database on a rebuild and writes them to the shards and the index', () => {
    const out = join(repo, 'kept')
    build(out)
    translate(out)
    const log = build(out)
    const want = { es: 'La española: el alfil presiona al caballo que defiende e5.', de: 'Spanisch: Der Läufer drückt auf den Springer, der e5 deckt.' }
    expect(entry(out, shardOf(out)).translations).toEqual(want)
    expect(entry(out, 'comments-index/0.json').translations).toEqual(want)
    const db = new DatabaseSync(join(out, 'comments.sqlite'))
    const rows = db.prepare("SELECT t.lang FROM comment_translations t JOIN position_comments c ON c.id = t.comment_id WHERE c.san = 'Bb5' ORDER BY t.lang").all()
    db.close()
    expect(rows.map((r) => r.lang)).toEqual(['de', 'es'])
    expect(JSON.parse(readFileSync(join(out, 'index.json'), 'utf8')).translations).toBe(2)
    expect(log).toMatch(/2 translations/)
  })

  it('reads the translations of another database with --translations', () => {
    const from = join(repo, 'from')
    build(from)
    translate(from)
    const out = join(repo, 'other')
    build(out, ['--translations', join(from, 'comments.sqlite')])
    expect(entry(out, shardOf(out)).translations).toMatchObject({ es: 'La española: el alfil presiona al caballo que defiende e5.' })
  })
})
