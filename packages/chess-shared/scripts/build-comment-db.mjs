// Builds the human commentary database: what book authors (and Lichess study
// writers) said about each position of their games.
//
// Usage:
//   node scripts/build-comment-db.mjs <manifest.json> <out-dir> [--errata <errata-dir>]
//
// manifest.json: [{ "file": "kasparov3.txt", "title": "Mis geniales predecesores III",
//                   "author": "Garry Kasparov", "lang": "es", "kind": "book" },
//                 { "file": "studies.pgn", "title": "Lichess studies", "lang": "en", "kind": "lichess" }]
// An entry may give an "id" instead of a "file": the book is text/<id>.txt next
// to the manifest, so a resources repository's books/manifest.json works as it is.
// "kind" defaults to "book". Paths are relative to the manifest.
// Text files are books converted to plain text (chapters separated by form
// feeds); .pgn files are games with {comments}.
//
// --errata <dir>: the errata/ folder of a resources repository. Each entry's
// corrected moves replace the printed ones in its game's main line (chapter =
// the n-th non-empty form-feed part, as the reader counts) before the comments
// are extracted, so the comments sit on the positions the game really reached.
//
// Writes, under <out-dir>:
//   comments.sqlite       the database (schema: apps/api/migrations/005_position_comments.sql)
//   index.json            sources, counts, shard layout
//   p/<xx>.json           comments of the positions whose hash starts with xx
//                         (each with its ply and full move number, `move`)
//   g/<game id>.json      the whole game (PGN) a comment comes from
//   comments-index/meta.json  { total, pages, pageSize, sources } of the list below
//   comments-index/<n>.json   every comment, PAGE_SIZE per page from 0, with its full
//                         FEN, move, game, players and `chapter` (the book chapter it
//                         was read from, counted as the game database does: only
//                         form-feed parts with text; null for PGN sources) — the
//                         browser's Database → Comments list when there is no server
//
// Book texts and comments are third-party works: never commit the output.
// Publish it only to a private place (see README).
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { recognizeGames, extractPositionComments, extractPlayers, treeToPgn, spanishToEnglish } from '../dist/index.js';
import { applyErrata, errataFor, loadErrata } from './errata.mjs';

const args = process.argv.slice(2);
const errataAt = args.indexOf('--errata');
const errataDir = errataAt >= 0 ? args.splice(errataAt, 2)[1] : null;
const [manifestPath, outDir] = args;
if (!manifestPath || !outDir || (errataAt >= 0 && !errataDir)) {
  console.error('usage: node scripts/build-comment-db.mjs <manifest.json> <out-dir> [--errata <errata-dir>]');
  process.exit(1);
}
const errata = errataDir ? loadErrata(errataDir) : new Map();
let errataApplied = 0;
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
const base = manifestPath.replace(/[^/]*$/, '') || '.';
const PAGE_SIZE = 2000; // comments per comments-index page
const MIN_PLY = 8; // opening moves get generic remarks: kept, but the lookup may skip them

rmSync(outDir, { recursive: true, force: true });
mkdirSync(join(outDir, 'p'), { recursive: true });
mkdirSync(join(outDir, 'g'), { recursive: true });
mkdirSync(join(outDir, 'comments-index'), { recursive: true });
const db = new DatabaseSync(join(outDir, 'comments.sqlite'));
db.exec(readFileSync(new URL('../../../apps/api/migrations/005_position_comments.sql', import.meta.url), 'utf8'));
// Full move number of each comment (ply 15 → move 8). Optional for readers: older databases lack it.
if (!db.prepare('PRAGMA table_info(position_comments)').all().some((c) => c.name === 'move_number')) {
  db.exec('ALTER TABLE position_comments ADD COLUMN move_number INTEGER');
}
// The book chapter of each comment, and the resources id of each book (both optional for readers).
for (const [table, column] of [['position_comments', 'chapter INTEGER'], ['comment_sources', 'book_id TEXT']]) {
  if (!db.prepare(`PRAGMA table_info(${table})`).all().some((c) => c.name === column.split(' ')[0])) db.exec(`ALTER TABLE ${table} ADD COLUMN ${column}`);
}

const insSource = db.prepare('INSERT INTO comment_sources (id, kind, title, author, lang, priority, book_id) VALUES (?, ?, ?, ?, ?, ?, ?)');
const insGame = db.prepare('INSERT OR REPLACE INTO comment_games (id, source_id, white, black, label, pgn) VALUES (?, ?, ?, ?, ?, ?)');
const insComment = db.prepare('INSERT INTO position_comments (hash, position, game_id, ply, move_number, san, lang, text, chapter) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)');

const shards = new Map();
const sources = {};
const listed = []; // the comments-index entries, in id order
let total = 0;

/** Chunks of a book or a PGN file that each hold games and their prose. */
function chunksOf(entry, text) {
  if (entry.file.endsWith('.pgn')) {
    return text.replace(/\r/g, '').split(/\n\n(?=\[Event )/).map((raw) => {
      const i = raw.indexOf('\n\n');
      // PGN comments in braces are the prose: written as paragraphs so the recogniser reads them as text.
      const moves = i < 0 ? raw : raw.slice(i + 2).replace(/\[%[^\]]*\]/g, '').replace(/\{([^}]*)\}/g, '\n$1\n');
      return { header: i < 0 ? '' : raw.slice(0, i), body: moves };
    });
  }
  return text.split(/\f|\n(?=(?:Partida|Game|Partie)\s+\d+\s*\n)/).map((body) => ({ header: '', body }));
}

/**
 * The chapters of a book text with its errata applied, in English letters, each
 * with its number: a chapter is a non-empty form-feed part, numbered from 1 as
 * the reader does (an empty part has none).
 */
function correctedChapters(entry, text) {
  let chapter = 0;
  return text.replace(/\r/g, '').split('\f').map((part) => {
    const body = entry.lang === 'es' ? spanishToEnglish(part) : part;
    if (!part.trim()) return { body, chapter: null };
    chapter++;
    const entries = errataFor(errata, { title: entry.title, id: entry.id }, chapter);
    if (!entries.length) return { body, chapter };
    try {
      const out = applyErrata(body, entries, { lang: entry.lang });
      errataApplied += out.applied;
      return { body: out.text, chapter };
    } catch {
      return { body, chapter };
    }
  });
}

manifest.forEach((entry, sourceIndex) => {
  const sourceId = sourceIndex + 1;
  const kind = entry.kind ?? 'book';
  const file = entry.file ?? `text/${entry.id}.txt`;
  const priority = kind === 'book' ? 1 : 2;
  const bookId = kind === 'book' && entry.id ? entry.id : null;
  insSource.run(sourceId, kind, entry.title, entry.author ?? null, entry.lang, priority, bookId);
  sources[sourceId] = { kind, title: entry.title, author: entry.author ?? null, lang: entry.lang, priority, book: bookId };
  const raw = readFileSync(resolve(base, file), 'utf8');
  // Books: chapters in English letters with their errata applied, then cut as before.
  const chunks = file.endsWith('.pgn')
    ? chunksOf({ file }, raw).map((c) => ({ ...c, body: entry.lang === 'es' ? spanishToEnglish(c.body) : c.body, chapter: null }))
    : correctedChapters(entry, raw).flatMap(({ body, chapter }) => chunksOf({ file }, body).map((c) => ({ ...c, chapter })));
  let gameNo = 0;
  let count = 0;
  for (const chunk of chunks) {
    const body = chunk.body;
    let games;
    try { games = recognizeGames(body, { algorithm: 2 }); } catch { continue; }
    let prevEnd = 0;
    for (const game of games) {
      if (game.tree.mainline.length < 10) { prevEnd = game.charEnd; continue; }
      gameNo++;
      const gameId = `${sourceId}-${gameNo}`;
      const players = extractPlayers(chunk.header + '\n' + body.slice(prevEnd, game.charStart + 1));
      const prevGameEnd = prevEnd;
      prevEnd = game.charEnd;
      const comments = extractPositionComments(body, game, { lang: entry.lang });
      if (comments.length === 0) continue;
      // Books name a game by a heading line before it: "M. Botvinnik - M. Tal", "Partida 12".
      const heading = body.slice(Math.max(prevGameEnd, game.charStart - 400), game.charStart).split('\n').map((l) => l.trim())
        .filter((l) => l.length > 4 && l.length < 90 && (/^\p{Lu}[^\n]{1,40}\s?[-–—]\s?\p{Lu}/u.test(l) || /^(Partida|Game)\s+\d+/i.test(l)))
        .pop()
      const label = [players.white, players.black].filter(Boolean).join(' – ') || heading || '';
      const pgn = treeToPgn(game.tree);
      insGame.run(gameId, sourceId, players.white ?? null, players.black ?? null, label || null, pgn);
      writeFileSync(join(outDir, 'g', `${gameId}.json`), JSON.stringify({ id: gameId, source: sourceId, white: players.white, black: players.black, pgn }));
      for (const c of comments) {
        // The move as written in the game (a game set up from a FEN keeps its numbering), else from the ply.
        const move = c.moveNumber ?? Math.ceil(c.ply / 2);
        const info = insComment.run(c.hash, c.key, gameId, c.ply, move, c.san, c.lang, c.text, chunk.chapter);
        const id = Number(info.lastInsertRowid);
        listed.push({ id, hash: c.hash, fen: `${c.key} 0 1`, text: c.text, lang: c.lang, ply: c.ply, move, san: c.san, game: gameId, source: sourceId,
          label: label || null, white: players.white ?? null, black: players.black ?? null, chapter: chunk.chapter });
        const prefix = c.hash.slice(0, 2);
        const shard = shards.get(prefix) ?? shards.set(prefix, {}).get(prefix);
        (shard[c.hash] ??= []).push({ id, text: c.text, lang: c.lang, game: gameId, ply: c.ply, move, san: c.san, source: sourceId, label: label || null });
        count++;
      }
    }
  }
  total += count;
  sources[sourceId].comments = count;
  console.log(`${entry.title}: ${gameNo} games, ${count} comments`);
});

const pageCount = Math.ceil(listed.length / PAGE_SIZE);
for (let n = 0; n < pageCount; n++) {
  writeFileSync(join(outDir, 'comments-index', `${n}.json`), JSON.stringify({ page: n, comments: listed.slice(n * PAGE_SIZE, (n + 1) * PAGE_SIZE) }));
}
writeFileSync(join(outDir, 'comments-index', 'meta.json'), JSON.stringify({ version: 1, total: listed.length, pages: pageCount, pageSize: PAGE_SIZE, page: 'comments-index/<n>.json', sources }, null, 1));
for (const [prefix, shard] of shards) writeFileSync(join(outDir, 'p', `${prefix}.json`), JSON.stringify(shard));
writeFileSync(join(outDir, 'index.json'), JSON.stringify({ version: 1, built: new Date().toISOString(), hash: 'fnv1a64(fen without move counters)', shard: 'p/<first 2 hex>.json', games: 'g/<id>.json', minPly: MIN_PLY, total, errata: errataApplied, sources }, null, 1));
db.close();
console.log(`total ${total} comments in ${shards.size} shards, ${errataApplied} errata corrections applied`);
