#!/usr/bin/env node
/**
 * Which squares do annotators talk about in each opening? (S10)
 *
 *   node scripts/learn-opening-squares.mjs <annotated.pgn> [--book <book.txt>] … > table.json
 *
 * For every annotated game the opening is named (openingName) and the squares
 * written in the remarks of the first 15 moves are counted ("the fight for d5",
 * "a knight on e4"). A square is kept for an opening when it is mentioned in at
 * least 3 games of it. Only counts leave the corpus, never text.
 */
import { readFileSync } from 'node:fs';
import { recognizeGames, openingName } from '../dist/index.js';

const files = [];
for (let i = 2; i < process.argv.length; i++) {
  if (process.argv[i] === '--book') files.push({ path: process.argv[++i], book: true });
  else files.push({ path: process.argv[i], book: false });
}
const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
const table = new Map(); // opening -> square -> Set(game ids)
const games = new Map(); // opening -> count
let id = 0;
for (const f of files) {
  const raw = readFileSync(f.path, 'utf8').replace(/\r/g, '');
  const chunks = f.book ? raw.split(/\f|\n(?=(?:Partida|Game)\s+\d+\s*\n)/) : raw.split(/\n\n(?=\[Event )/);
  for (const chunk of chunks) {
    const split = f.book ? 0 : chunk.indexOf('\n\n');
    if (split < 0 || (!f.book && /\[FEN "/.test(chunk.slice(0, split)))) continue;
    const text = f.book ? chunk : chunk.slice(split + 2).replace(/\[%[^\]]*\]/g, '');
    let found;
    try { found = recognizeGames(text, { algorithm: 2 }); } catch { continue; }
    for (const g of found) {
      if (g.tree.startFen !== START || g.tree.mainline.length < 20) continue;
      const main = g.tree.mainline.map((n) => g.tree.nodes.get(n));
      const name = openingName(main.map((n) => n.san), 'en');
      if (!name) continue;
      const family = name.split(/[:,]/)[0].trim();
      id++;
      games.set(family, (games.get(family) ?? 0) + 1);
      // Prose of the first 15 moves, without the moves themselves.
      const end = main[Math.min(29, main.length - 1)].charEnd;
      let prose = text.slice(main[0].charStart, end);
      for (const n of [...g.tree.nodes.values()]) if (n.charStart >= main[0].charStart && n.charEnd <= end) prose = prose.slice(0, n.charStart - main[0].charStart) + ' '.repeat(n.charEnd - n.charStart) + prose.slice(n.charEnd - main[0].charStart);
      const squares = new Set(prose.match(/(?<![A-Za-z0-9])[a-h][1-8](?![0-9])/g) ?? []);
      const row = table.get(family) ?? new Map();
      for (const sq of squares) row.set(sq, (row.get(sq) ?? new Set()).add(id));
      table.set(family, row);
    }
  }
}
const out = {};
for (const [family, row] of table) {
  const keep = [...row].map(([sq, ids]) => [sq, ids.size]).filter(([, n]) => n >= 3).sort((a, b) => b[1] - a[1]).slice(0, 4);
  if (keep.length) out[family] = { games: games.get(family), squares: Object.fromEntries(keep) };
}
console.log(JSON.stringify(out, null, 1));
