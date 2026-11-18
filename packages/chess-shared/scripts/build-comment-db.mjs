// Builds the human commentary database: what book authors (and Lichess study
// writers) said about each position of their games.
//
// Usage:
//   node scripts/build-comment-db.mjs <manifest.json> <out-dir>
//
// manifest.json: [{ "file": "kasparov3.txt", "title": "Mis geniales predecesores III",
//                   "author": "Garry Kasparov", "lang": "es", "kind": "book" },
//                 { "file": "studies.pgn", "title": "Lichess studies", "lang": "en", "kind": "lichess" }]
// Text files are books converted to plain text (chapters separated by form
// feeds); .pgn files are games with {comments}.
//
// Writes, under <out-dir>:
//   comments.sqlite       the database (schema: apps/api/migrations/005_position_comments.sql)
//   index.json            sources, counts, shard layout
//   p/<xx>.json           comments of the positions whose hash starts with xx
//                         (each with its ply and full move number, `move`)
//   g/<game id>.json      the whole game (PGN) a comment comes from
//
// Book texts and comments are third-party works: never commit the output.
// Publish it only to a private place (see README).
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { recognizeGames, extractPositionComments, extractPlayers, treeToPgn, spanishToEnglish } from '../dist/index.js';

const [manifestPath, outDir] = process.argv.slice(2);
if (!manifestPath || !outDir) {
  console.error('usage: node scripts/build-comment-db.mjs <manifest.json> <out-dir>');
  process.exit(1);
}
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
const base = manifestPath.replace(/[^/]*$/, '');
const MIN_PLY = 8; // opening moves get generic remarks: kept, but the lookup may skip them

rmSync(outDir, { recursive: true, force: true });
mkdirSync(join(outDir, 'p'), { recursive: true });
mkdirSync(join(outDir, 'g'), { recursive: true });
const db = new DatabaseSync(join(outDir, 'comments.sqlite'));
db.exec(readFileSync(new URL('../../../apps/api/migrations/005_position_comments.sql', import.meta.url), 'utf8'));
// Full move number of each comment (ply 15 → move 8). Optional for readers: older databases lack it.
if (!db.prepare('PRAGMA table_info(position_comments)').all().some((c) => c.name === 'move_number')) {
  db.exec('ALTER TABLE position_comments ADD COLUMN move_number INTEGER');
}

const insSource = db.prepare('INSERT INTO comment_sources (id, kind, title, author, lang, priority) VALUES (?, ?, ?, ?, ?, ?)');
const insGame = db.prepare('INSERT OR REPLACE INTO comment_games (id, source_id, white, black, label, pgn) VALUES (?, ?, ?, ?, ?, ?)');
const insComment = db.prepare('INSERT INTO position_comments (hash, position, game_id, ply, move_number, san, lang, text) VALUES (?, ?, ?, ?, ?, ?, ?, ?)');

const shards = new Map();
const sources = {};
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

manifest.forEach((entry, sourceIndex) => {
  const sourceId = sourceIndex + 1;
  const priority = entry.kind === 'book' ? 1 : 2;
  insSource.run(sourceId, entry.kind, entry.title, entry.author ?? null, entry.lang, priority);
  sources[sourceId] = { kind: entry.kind, title: entry.title, author: entry.author ?? null, lang: entry.lang, priority };
  const raw = readFileSync(join(base, entry.file), 'utf8');
  let gameNo = 0;
  let count = 0;
  for (const chunk of chunksOf(entry, raw)) {
    const body = entry.lang === 'es' ? spanishToEnglish(chunk.body) : chunk.body;
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
        const info = insComment.run(c.hash, c.key, gameId, c.ply, move, c.san, c.lang, c.text);
        const id = Number(info.lastInsertRowid);
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

for (const [prefix, shard] of shards) writeFileSync(join(outDir, 'p', `${prefix}.json`), JSON.stringify(shard));
writeFileSync(join(outDir, 'index.json'), JSON.stringify({ version: 1, built: new Date().toISOString(), hash: 'fnv1a64(fen without move counters)', shard: 'p/<first 2 hex>.json', games: 'g/<id>.json', minPly: MIN_PLY, total, sources }, null, 1));
db.close();
console.log(`total ${total} comments in ${shards.size} shards`);
