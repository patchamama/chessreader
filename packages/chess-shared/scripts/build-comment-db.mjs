// Builds the human commentary database: what book authors (and Lichess study
// writers) said about each position of their games.
//
// Usage:
//   node scripts/build-comment-db.mjs <manifest.json> <out-dir> [--errata <errata-dir>] [--translations <comments.sqlite>]
//
// manifest.json: [{ "file": "kasparov3.txt", "title": "Mis geniales predecesores III",
//                   "author": "Garry Kasparov", "lang": "es", "kind": "book" },
//                 { "file": "studies.pgn", "title": "Lichess studies", "lang": "en", "kind": "lichess" }]
// An entry may give an "id" instead of a "file": the book is text/<id>.txt next
// to the manifest, so a resources repository's books/manifest.json works as it is.
// "kind" defaults to "book". Paths are relative to the manifest.
// Text files are books converted to plain text (chapters separated by form
// feeds), read with the game recogniser; .pgn files are games with {comments},
// read straight from the moves (scripts/pgnComments.mjs): every human comment of
// the main line and the variations lands on the position after the move it
// follows (a comment before a line's first move: the position the line starts
// from), without clock/eval/arrow commands or engine-only notes.
//
// --errata <dir>: the errata/ folder of a resources repository. Each entry's
// corrected moves replace the printed ones in its game's main line (chapter =
// the n-th non-empty form-feed part, as the reader counts) before the comments
// are extracted, so the comments sit on the positions the game really reached.
//
// Translations (comment_translations rows, written by translate-comments.mjs)
// are kept across rebuilds: the ones of <out-dir>/comments.sqlite, or of
// --translations <comments.sqlite>, are matched to the rebuilt comments by
// position and original text, stored again and written to the static outputs
// as `translations: { es: "…", … }` (only on comments that have some).
//
// Writes, under <out-dir>:
//   comments.sqlite       the database (schema: apps/api/migrations/005_position_comments.sql)
//   index.json            sources, counts, shard layout
//   p/<xx>.json           comments of the positions whose hash starts with xx
//                         (each with its ply and full move number, `move`, and
//                         its `translations` when it has some)
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
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { recognizeGames, extractPositionComments, extractPlayers, treeToPgn, spanishToEnglish, positionHash, positionKey } from '../dist/index.js';
import { applyErrata, errataFor, loadErrata } from './errata.mjs';
import { cleanGamePgn, pgnPositionComments, splitPgnGames } from './pgnComments.mjs';

const args = process.argv.slice(2);
const errataAt = args.indexOf('--errata');
const errataDir = errataAt >= 0 ? args.splice(errataAt, 2)[1] : null;
const translationsAt = args.indexOf('--translations');
const translationsDb = translationsAt >= 0 ? args.splice(translationsAt, 2)[1] : null;
const [manifestPath, outDir] = args;
if (!manifestPath || !outDir || (errataAt >= 0 && !errataDir) || (translationsAt >= 0 && !translationsDb)) {
  console.error('usage: node scripts/build-comment-db.mjs <manifest.json> <out-dir> [--errata <errata-dir>] [--translations <comments.sqlite>]');
  process.exit(1);
}
const errata = errataDir ? loadErrata(errataDir) : new Map();
let errataApplied = 0;
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
const base = manifestPath.replace(/[^/]*$/, '') || '.';
const PAGE_SIZE = 2000; // comments per comments-index page
const MIN_PLY = 8; // opening moves get generic remarks: kept, but the lookup may skip them

const MIN_PGN_PLIES = 10; // a game needs this many main-line half-moves, as recognised book games do

/** Translations of an earlier database, by position and original text: key → [[lang, text], …]. */
function loadTranslations(path) {
  const found = new Map();
  if (!path || !existsSync(path)) return found;
  const old = new DatabaseSync(path, { readOnly: true });
  try {
    const rows = old.prepare(`SELECT c.position, c.text AS original, t.lang, t.text FROM comment_translations t
      JOIN position_comments c ON c.id = t.comment_id ORDER BY t.comment_id, t.lang`).all();
    for (const r of rows) {
      const key = `${r.position}\u0000${r.original}`;
      (found.get(key) ?? found.set(key, []).get(key)).push([r.lang, r.text]);
    }
  } catch {
    // An older or foreign database without the tables: nothing to keep.
  } finally {
    old.close();
  }
  return found;
}
const translations = loadTranslations(translationsDb ?? join(outDir, 'comments.sqlite'));
let translated = 0;

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
const insTranslation = db.prepare('INSERT INTO comment_translations (comment_id, lang, text) VALUES (?, ?, ?)');

const shards = new Map();
const sources = {};
const listed = []; // the comments-index entries, in id order
let total = 0;

/**
 * Stores one comment of a game: the database row, its comments-index entry and
 * its shard entry, with its translations when an earlier database had some.
 * c: { key, hash, ply, move, san, lang, text }.
 */
function addComment(c, { gameId, sourceId, label, players, chapter }) {
  const info = insComment.run(c.hash, c.key, gameId, c.ply, c.move, c.san, c.lang, c.text, chapter);
  const id = Number(info.lastInsertRowid);
  const kept = translations.get(`${c.key}\u0000${c.text}`);
  const extra = {};
  if (kept) {
    for (const [lang, text] of kept) insTranslation.run(id, lang, text);
    extra.translations = Object.fromEntries(kept);
    translated += kept.length;
  }
  listed.push({ id, hash: c.hash, fen: `${c.key} 0 1`, text: c.text, lang: c.lang, ply: c.ply, move: c.move, san: c.san, game: gameId, source: sourceId,
    label: label || null, white: players.white ?? null, black: players.black ?? null, chapter, ...extra });
  const prefix = c.hash.slice(0, 2);
  const shard = shards.get(prefix) ?? shards.set(prefix, {}).get(prefix);
  (shard[c.hash] ??= []).push({ id, text: c.text, lang: c.lang, game: gameId, ply: c.ply, move: c.move, san: c.san, source: sourceId, label: label || null, ...extra });
}

/** A PGN source: each game's comments read from its moves. Returns { games, comments }. */
function addPgnSource(entry, sourceId, raw) {
  let gameNo = 0;
  let count = 0;
  for (const game of splitPgnGames(raw)) {
    const { tags, moves, comments } = pgnPositionComments(game);
    if (moves < MIN_PGN_PLIES) continue;
    gameNo++;
    if (comments.length === 0) continue;
    const gameId = `${sourceId}-${gameNo}`;
    const name = (tag) => (tag && tag !== '?' ? tag : undefined);
    const players = { white: name(tags.White), black: name(tags.Black) };
    const label = [players.white, players.black].filter(Boolean).join(' – ') || tags.ChapterName || tags.Event || '';
    const pgn = cleanGamePgn(game);
    insGame.run(gameId, sourceId, players.white ?? null, players.black ?? null, label || null, pgn);
    writeFileSync(join(outDir, 'g', `${gameId}.json`), JSON.stringify({ id: gameId, source: sourceId, white: players.white, black: players.black, pgn }));
    for (const c of comments) {
      addComment({ key: positionKey(c.fen), hash: positionHash(c.fen), ply: c.ply, move: c.move, san: c.san, lang: entry.lang, text: c.text },
        { gameId, sourceId, label, players, chapter: null });
      count++;
    }
  }
  return { games: gameNo, comments: count };
}

/** Chunks of a book that each hold games and their prose. */
function chunksOf(text) {
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
  if (file.endsWith('.pgn')) {
    const { games, comments } = addPgnSource(entry, sourceId, raw);
    total += comments;
    sources[sourceId].comments = comments;
    console.log(`${entry.title}: ${games} games, ${comments} comments`);
    return;
  }
  // Books: chapters in English letters with their errata applied, then cut as before.
  const chunks = correctedChapters(entry, raw).flatMap(({ body, chapter }) => chunksOf(body).map((c) => ({ ...c, chapter })));
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
        addComment({ key: c.key, hash: c.hash, ply: c.ply, move, san: c.san, lang: c.lang, text: c.text },
          { gameId, sourceId, label, players, chapter: chunk.chapter });
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
writeFileSync(join(outDir, 'index.json'), JSON.stringify({ version: 1, built: new Date().toISOString(), hash: 'fnv1a64(fen without move counters)', shard: 'p/<first 2 hex>.json', games: 'g/<id>.json', minPly: MIN_PLY, total, errata: errataApplied, ...(translated ? { translations: translated } : {}), sources }, null, 1));
db.close();
console.log(`total ${total} comments in ${shards.size} shards, ${errataApplied} errata corrections applied${translated ? `, ${translated} translations kept` : ''}`);
