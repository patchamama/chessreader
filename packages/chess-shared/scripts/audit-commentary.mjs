#!/usr/bin/env node
/**
 * Comment many games and check every remark against the board (S26).
 *
 *   node scripts/audit-commentary.mjs <games.pgn> [--examples <kind>] [--limit N]
 *
 * Each game is reviewed as the product does (no engine: even evaluations), and
 * every idea the commentary would write is checked by auditMotif against the
 * position and the moves that followed. Prints, per idea, how often it was
 * written and how often its check failed, with examples of the failures.
 */
import { readFileSync } from 'node:fs';
import { recognizeGames, reviewGame, auditMotif } from '../dist/index.js';

const [file, ...flags] = process.argv.slice(2);
if (!file) { console.error('usage: audit-commentary.mjs <games.pgn> [--examples <kind>] [--limit N]'); process.exit(2); }
const example = flags.includes('--examples') ? flags[flags.indexOf('--examples') + 1] : null;
const limit = flags.includes('--limit') ? Number(flags[flags.indexOf('--limit') + 1]) : Infinity;
const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

const stats = new Map();
let games = 0;
for (const raw of readFileSync(file, 'utf8').replace(/\r/g, '').split(/\n\n(?=\[Event )/)) {
  if (games >= limit) break;
  const split = raw.indexOf('\n\n');
  if (split < 0 || /\[FEN "/.test(raw.slice(0, split))) continue;
  // Bare moves only: comments and variations dropped.
  const text = raw.slice(split + 2).replace(/\{[^}]*\}/g, ' ').replace(/\[%[^\]]*\]/g, '');
  let bare = '';
  let depth = 0;
  for (const ch of text) { if (ch === '(') depth++; else if (ch === ')') depth = Math.max(0, depth - 1); else if (!depth) bare += ch; }
  let game;
  try { [game] = recognizeGames(bare.replace(/\s+/g, ' '), { algorithm: 2 }); } catch { continue; }
  if (!game || game.tree.startFen !== START || game.tree.mainline.length < 10) continue;
  games++;
  const main = game.tree.mainline.map((id) => game.tree.nodes.get(id));
  const plies = main.map((n, k) => ({
    nodeId: n.id, san: n.san, color: n.color, moveNumber: n.moveNumber, from: n.from, to: n.to,
    fenBefore: k === 0 ? START : main[k - 1].fen, fenAfter: n.fen, before: { cp: 0 }, after: { cp: 0 },
  }));
  const review = reviewGame(plies);
  review.moves.forEach((mv, i) => {
    for (const m of mv.motifs) {
      const s = stats.get(m.kind) ?? { written: 0, wrong: 0, examples: [] };
      s.written++;
      const reason = auditMotif(m, plies, i);
      if (reason) {
        s.wrong++;
        if (s.examples.length < 15) s.examples.push(`${plies[i].moveNumber}${plies[i].color === 'white' ? '.' : '...'} ${plies[i].san} [${m.squares.join(' ')}]: ${reason}  ${plies[i].fenBefore}`);
      }
      stats.set(m.kind, s);
    }
  });
}
if (example) {
  for (const line of stats.get(example)?.examples ?? []) console.log(line);
} else {
  console.log(`${games} games`);
  console.log('idea                written  wrong   rate');
  for (const [kind, s] of [...stats].sort((a, b) => b[1].wrong - a[1].wrong)) {
    console.log(`${kind.padEnd(19)} ${String(s.written).padStart(7)} ${String(s.wrong).padStart(6)} ${(100 * s.wrong / s.written).toFixed(1).padStart(6)}%`);
  }
}
