#!/usr/bin/env node
/**
 * How much of what human annotators point out does the automatic commentary find?
 *
 *   node scripts/evaluate-commentary.mjs <annotated.pgn> [--misses <tag,tag…>] [--json]
 *   node scripts/evaluate-commentary.mjs --book <book.txt> [--misses …] [--json]
 *
 * `--book` reads the plain text of a chess book (an epub turned into text,
 * one paragraph per line): every game is recognised in it and the prose
 * between two moves of the main line is the author's remark on the first.
 *
 * For every annotated game the comments are read for the ideas they name (a
 * fork, a pin, a sacrifice, a hanging piece…). The comments are then thrown
 * away, the bare game is run through the detectors, and for each idea the
 * script reports:
 *   - recall:    share of the annotators' mentions the detectors also found at
 *                that move (or the move right before / after it);
 *   - fire rate: how often the detector fires on any move — a detector that
 *                fires everywhere "finds" everything and says nothing;
 *   - lift:      recall / fire rate. Above 1 the detector agrees with the
 *                annotators more than chance would.
 * `--misses <tag>` prints the comments of the mentions that were not found:
 * the material for the next detector.
 */
import { readFileSync } from 'node:fs';
import { recognizeGames, reviewGame, positionIdeas } from '../dist/index.js';

const argv = process.argv.slice(2);
const book = argv[0] === '--book';
const [file, ...flags] = book ? argv.slice(1) : argv;
if (!file) { console.error('usage: evaluate-commentary.mjs <annotated.pgn> [--misses <tag>] [--json]'); process.exit(2); }
const missesOf = flags.includes('--misses') ? flags[flags.indexOf('--misses') + 1] : null;

/** What annotators call each idea (English and Spanish). */
const GOLD = {
  fork: /\bfork|double attack|ataque doble|horquilla/i,
  pin: /\bpin(s|ned|ning)?\b|\bclava/i,
  skewer: /skewer|enfilada/i,
  sacrifice: /sacrific|\bsacs?\b|\bentrega/i,
  discovered: /discover|descubiert/i,
  hanging: /hanging|undefended|unprotected|\bloose\b|en prise|indefens|sin defensa|colgad/i,
  'wins-material': /wins? (a |the )?(piece|pawn|exchange|queen|rook|knight|bishop|material)|winning (a |the )?(piece|pawn|exchange|material)|gana (una |la |un |el )?(pieza|peón|calidad|dama|torre|material)/i,
  outpost: /outpost|weak square|strong square|\bhole\b|casilla débil|puesto avanzado/i,
  'passed-pawn': /passed pawn|\bpasser|peón pasado|peón libre/i,
  'open-file': /open file|half-open|semi-open|open [a-h]-file|columna abierta|columna semiabierta/i,
  battery: /battery|doubl\w+ (the |his |her )?rooks|batería|dobla\w* (las )?torres/i,
  'x-ray': /x-?ray|rayos x/i,
  threat: /\bthreat|amenaz/i,
  development: /\bdevelop|desarroll/i,
  castling: /\bcastl|enroc|enroque/i,
  trapped: /\btrapp|atrapad|encerrad/i,
  overloaded: /overload|overworked|sobrecarg/i,
  combination: /combination|combinaci[oó]n/i,
  mate: /\bmate\b|checkmate|\bmates\b|jaque mate/i,
};

/** Which detector outputs count as finding each idea. */
const FOUND = {
  fork: (m, i) => m.has('fork') || m.has('threat:fork'),
  pin: (m, i) => m.has('pin') || i.pinned > 0,
  skewer: (m) => m.has('skewer'),
  sacrifice: (m) => m.has('sacrifice') || m.has('exchange-sacrifice') || m.has('pawn-sacrifice') || m.has('positional-sacrifice'),
  discovered: (m) => m.has('discovered-check') || m.has('discovered-attack') || m.has('double-check') || m.has('threat:discovered'),
  hanging: (m, i) => m.has('attack-undefended') || m.has('leaves-hanging') || m.has('wins-material') || i.hanging > 0,
  'wins-material': (m) => m.has('wins-material') || m.has('threat:capture'),
  outpost: (m, i) => m.has('outpost') || i.outposts > 0,
  'passed-pawn': (m, i) => m.has('passed-pawn') || i.passed > 0,
  'open-file': (m) => m.has('open-file'),
  battery: (m) => m.has('battery'),
  'x-ray': (m) => m.has('x-ray'),
  threat: (m) => m.has('threat') || m.has('attack-undefended') || m.has('fork') || m.has('mate-threat') || m.has('discovered-attack') || m.has('joint-attack') || m.has('check') || m.has('pin') || m.has('skewer'),
  development: (m) => m.has('development'),
  castling: (m) => m.has('castle') || m.has('prepares-castling'),
  trapped: (m) => m.has('traps'),
  overloaded: (m) => m.has('overloaded'),
  combination: (m) => m.has('combination') || m.has('sacrifice') || m.has('exchange-sacrifice'),
  mate: (m) => m.has('mate') || m.has('mate-threat') || m.has('threat:mate') || m.has('aims-at'),
};

const pgn = readFileSync(file, 'utf8').replace(/\r/g, '');
// A book: one chunk per game heading ("Partida 12", "Game 12") or chapter break.
const games = book
  ? pgn.split(/\f|\n(?=(?:Partida|Game|Partie|Partie Nr\.?)\s+\d+\s*\n)/).map((t) => `\n\n${t}`)
  : pgn.split(/\n\n(?=\[Event )/);
const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
const stats = Object.fromEntries(Object.keys(GOLD).map((t) => [t, { gold: 0, found: 0, fired: 0, misses: [] }]));
let plies = 0;
let used = 0;
let comments = 0;

for (const raw of games) {
  const split = raw.indexOf('\n\n');
  if (split < 0 || /\[FEN "/.test(raw.slice(0, split))) continue;
  const text = book ? raw.slice(split + 2) : raw.slice(split + 2).replace(/\[%[^\]]*\]/g, '').replace(/\s+/g, ' ').trim();
  let found;
  try { found = recognizeGames(text, { algorithm: 2 }); } catch { continue; }
  for (const game of found) {
  if (!game || game.tree.mainline.length < 10 || game.tree.startFen !== START) continue;
  const tree = game.tree;
  const main = tree.mainline.map((id) => tree.nodes.get(id));
  // Detector output per ply, from the bare moves (as the product does: the
  // whole game is reviewed, so ideas seen from later moves count too; no engine).
  const review = reviewGame(main.map((node, k) => ({
    nodeId: node.id, san: node.san, color: node.color, moveNumber: node.moveNumber, from: node.from, to: node.to,
    fenBefore: k === 0 ? tree.startFen : main[k - 1].fen, fenAfter: node.fen, before: { cp: 0 }, after: { cp: 0 },
  })));
  const detected = main.map((node, k) => {
    const found = review.moves[k].motifs;
    const motifs = new Set(found.map((m) => m.kind));
    for (const m of found) if (m.kind === 'threat') motifs.add(`threat:${m.data.type}`);
    if (k < 24 && /^[NB]/.test(node.san) && /[18]$/.test(node.from)) motifs.add('development');
    const ideas = positionIdeas(node.fen);
    const mover = node.color;
    return {
      motifs,
      ideas: {
        hanging: ideas.hanging.filter((h) => h.piece !== 'p').length,
        pinned: ideas.pinned.length,
        outposts: ideas.outposts.filter((o) => o.color === mover).length,
        passed: ideas.passedPawns.filter((p) => p.color === mover && (mover === 'white' ? Number(p.square[1]) >= 5 : Number(p.square[1]) <= 4)).length,
      },
    };
  });
  let any = false;
  main.forEach((node, k) => {
    plies++;
    for (const tag of Object.keys(GOLD)) if (FOUND[tag](detected[k].motifs, detected[k].ideas)) stats[tag].fired++;
    // The annotator's remark on this move: braces at top level before the next move.
    const next = main[k + 1];
    const between = text.slice(node.charEnd, next ? next.charStart : text.length);
    let depth = 0;
    let remark = '';
    if (book) remark = between.replace(/Stockfish[^\n]*eval:[^\n]*/g, '').replace(/\ufffc/g, ' ');
    else for (const m of between.matchAll(/[()]|\{[^}]*\}/g)) {
      if (m[0] === '(') depth++;
      else if (m[0] === ')') depth = Math.max(0, depth - 1);
      else if (depth === 0) remark += ` ${m[0].slice(1, -1)}`;
    }
    if (!remark.trim()) return;
    comments++;
    any = true;
    for (const [tag, re] of Object.entries(GOLD)) {
      if (!re.test(remark)) continue;
      stats[tag].gold++;
      // A remark often names what the move threatens or what was just allowed: look one ply around.
      const hit = [k - 1, k, k + 1].some((j) => detected[j] && FOUND[tag](detected[j].motifs, detected[j].ideas));
      if (hit) stats[tag].found++;
      else if (stats[tag].misses.length < 400) stats[tag].misses.push(`${node.moveNumber}${node.color === 'white' ? '.' : '...'} ${node.san}: ${remark.trim().slice(0, 220)}`);
    }
  });
  if (any) used++;
  }
}

const rows = Object.entries(stats).map(([tag, s]) => ({
  tag, mentions: s.gold, found: s.found,
  recall: s.gold ? s.found / s.gold : 0,
  fireRate: plies ? s.fired / plies : 0,
}));
const totalGold = rows.reduce((a, r) => a + r.mentions, 0);
const totalFound = rows.reduce((a, r) => a + r.found, 0);
if (flags.includes('--json')) {
  console.log(JSON.stringify({ games: used, plies, comments, recall: totalGold ? totalFound / totalGold : 0, rows }, null, 2));
} else if (missesOf) {
  // Several ideas at once: --misses pin,fork,outpost
  for (const tag of missesOf.split(',')) {
    console.log(`== ${tag}`);
    for (const line of stats[tag]?.misses.slice(0, 12) ?? []) console.log(line);
  }
} else {
  console.log(`${used} annotated games · ${plies} moves · ${comments} remarks`);
  console.log('idea            mentions  found  recall  fires  lift');
  for (const r of rows.sort((a, b) => b.mentions - a.mentions)) {
    const lift = r.fireRate ? (r.recall / r.fireRate).toFixed(1) : '-';
    console.log(`${r.tag.padEnd(15)} ${String(r.mentions).padStart(8)} ${String(r.found).padStart(6)} ${(100 * r.recall).toFixed(0).padStart(6)}% ${(100 * r.fireRate).toFixed(0).padStart(5)}% ${String(lift).padStart(5)}`);
  }
  console.log(`ALL             ${String(totalGold).padStart(8)} ${String(totalFound).padStart(6)} ${(100 * totalFound / Math.max(1, totalGold)).toFixed(0).padStart(6)}%`);
}
