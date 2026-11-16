/**
 * Board cues: what a commentary says, expressed as things a board can show.
 *
 * A cue is device-independent — squares with a semantic ROLE (attacker, target,
 * line, weak…) and an optional blink, plus arrows between squares. The screen
 * board maps roles to colours; a physical board with LEDs can map the very same
 * roles to its lights. Nothing here knows about rendering.
 *
 * `analyseComment` reads one sentence or paragraph of commentary (Spanish or
 * English) against the position it talks about and returns its cues:
 *  - a named square ("la casilla f7")                      → square
 *  - a named piece ("el alfil de c4", "the knight on d7")  → piece (blinks)
 *  - a line ("la diagonal a2-g8", "columna d", "8th rank") → line
 *  - a relation ("X ataca Y", "X clavado por Y")           → attacker/target + arrow
 *  - a pawn structure named without squares                → computed from the position
 *  - a concept from the glossary                           → concept
 */

import { Chess, type Square, type PieceSymbol, type Color as ChessColor } from 'chess.js';
import { tokenize } from '../notation/sanTokenizer.js';
import { figurineToAscii } from '../notation/figurineToAscii.js';
import { findConcepts } from './concepts.js';

export type CueRole =
  | 'mention'   // a square the text names
  | 'piece'     // a piece the text names
  | 'attacker'
  | 'target'
  | 'defender'
  | 'line'      // a diagonal, file or rank
  | 'pawn'      // pawns of a named structure
  | 'from'      // origin of a move
  | 'to'        // destination of a move
  | 'capture'   // destination of a capture
  | 'check'     // the king in check
  | 'good'      // destination of a good move (text "!" or engine)
  | 'dubious'   // destination of a dubious move ("?!", "!?")
  | 'bad';      // destination of a bad move ("?", "??")

/** How good a move is, as the text marks it or an engine judges it. */
export type MoveQuality = 'brilliant' | 'good' | 'interesting' | 'dubious' | 'mistake' | 'blunder';

const QUALITY_ROLE: Record<MoveQuality, CueRole> = {
  brilliant: 'good', good: 'good', interesting: 'dubious', dubious: 'dubious', mistake: 'bad', blunder: 'bad',
};

/** Quality a move is given by its annotation glyph or NAG ("!", "??", "$6"). */
export function qualityFromAnnotation(mark: string): MoveQuality | undefined {
  const m = /^\s*(\?\?|!!|\?!|!\?|\?|!|\$[1-6]\b)/.exec(mark);
  if (!m) return undefined;
  return ({
    '!!': 'brilliant', '!': 'good', '!?': 'interesting', '?!': 'dubious', '?': 'mistake', '??': 'blunder',
    $1: 'good', $2: 'mistake', $3: 'brilliant', $4: 'blunder', $5: 'interesting', $6: 'dubious',
  } as Record<string, MoveQuality>)[m[1]];
}

export interface CueSquare {
  square: string;
  role: CueRole;
  blink?: boolean;
}

export interface CueArrow {
  from: string;
  to: string;
  role: CueRole;
}

export type CueKind = 'square' | 'piece' | 'line' | 'relation' | 'structure' | 'move' | 'concept' | 'area' | 'route';

export interface BoardCue {
  kind: CueKind;
  /** Short human-readable description, in the language of the comment. */
  label: string;
  squares: CueSquare[];
  arrows: CueArrow[];
  /** Glossary concept this cue illustrates, if any. */
  concept?: string;
  /** For a move cue: how good the move is (a board may colour it). */
  quality?: MoveQuality;
  /** Offsets of the phrase in the analysed text. */
  start: number;
  end: number;
}

const FILES = 'abcdefgh';
const sq = (f: number, r: number) => `${FILES[f]}${r + 1}`;
const fileOf = (s: string) => FILES.indexOf(s[0]);
const rankOf = (s: string) => Number(s[1]) - 1;

/** Squares from `a` to `b` inclusive when they share a diagonal, file or rank. */
export function lineSquares(a: string, b: string): string[] {
  const df = fileOf(b) - fileOf(a);
  const dr = rankOf(b) - rankOf(a);
  if (!(df === 0 || dr === 0 || Math.abs(df) === Math.abs(dr)) || (df === 0 && dr === 0)) return [];
  const steps = Math.max(Math.abs(df), Math.abs(dr));
  const out: string[] = [];
  for (let i = 0; i <= steps; i++) out.push(sq(fileOf(a) + Math.sign(df) * i, rankOf(a) + Math.sign(dr) * i));
  return out;
}

const plainText = (s: string) =>
  [...s].map((ch) => ch.normalize('NFD').replace(/[̀-ͯ]/g, '').slice(0, 1) || ch).join('').toLowerCase();

const PIECE_WORDS: Record<string, PieceSymbol> = {
  rey: 'k', dama: 'q', reina: 'q', torre: 'r', alfil: 'b', caballo: 'n', peon: 'p',
  king: 'k', queen: 'q', rook: 'r', bishop: 'b', knight: 'n', pawn: 'p',
  konig: 'k', konige: 'k', konigs: 'k', damen: 'q', turm: 'r', turme: 'r', turms: 'r',
  laufer: 'b', laufers: 'b', springer: 'n', springers: 'n', bauer: 'p', bauern: 'p',
};
const PIECE_RE = 'rey|damas?|reina|torres?|alfil(?:es)?|caballos?|peon(?:es)?|kings?|queens?|rooks?|bishops?|knights?|pawns?|konig(?:e|s)?|damen?|turm(?:e|s)?|laufers?|springers?|bauern?';
const COLOUR_RE = 'blanc[oa]s?|negr[oa]s?|white|black|wei(?:ß|ss)\\w*|schwarz\\w*';
const ON_RE = '(?:de|en|on|at|auf|von)\\s+(?:(?:la\\s+|the\\s+|dem\\s+)?(?:casilla|square|feld)\\s+)?';
const pieceOf = (word: string): PieceSymbol => {
  const w = word.replace(/(es|s)$/, '');
  return PIECE_WORDS[word] ?? PIECE_WORDS[w] ?? PIECE_WORDS[word.replace(/s$/, '')] ?? 'p';
};

const ORDINALS: Record<string, number> = {
  primera: 1, segunda: 2, tercera: 3, cuarta: 4, quinta: 5, sexta: 6, septima: 7, octava: 8,
  first: 1, second: 2, third: 3, fourth: 4, fifth: 5, sixth: 6, seventh: 7, eighth: 8,
};

interface Ref {
  square: string;
  /** Set for a piece named WITHOUT a square ("la dama"): which piece it is depends on who acts on it. */
  bare?: PieceSymbol;
  /** true when a piece of the named kind really stands on the square. */
  piece: boolean;
  start: number;
  end: number;
}

export interface AnalyseOptions {
  /** The move that led to this position (helps resolve "la dama ataca…"). */
  lastMove?: { from: string; to: string } | null;
}

export function analyseComment(text: string, fen: string, options: AnalyseOptions = {}): BoardCue[] {
  const chess = new Chess(fen);
  const plain = plainText(figurineToAscii(text));
  const cues: BoardCue[] = [];

  // Squares that belong to a quoted MOVE ("3... exd4 4. Nxd4") are not mentions.
  const moveRanges = tokenize(figurineToAscii(text))
    .filter((t) => t.type === 'move' && !(t.isolated && /^[a-h][1-8]$/.test(t.san ?? '')))
    .map((t) => [t.charStart, t.charEnd] as const);
  const inMove = (i: number) => moveRanges.some(([a, b]) => i >= a && i < b);

  const at = (square: string) => chess.get(square as Square);

  // ── piece references: "el alfil de c4", "the knight on d7" ────────────────
  const refs: Ref[] = [];
  const claimed = new Set<number>(); // start offsets of squares used by a piece ref
  {
    const re = new RegExp(`\\b(${PIECE_RE})(?:\\s+(?:${COLOUR_RE}))?\\s+${ON_RE}([a-h][1-8])(?![0-9a-z])`, 'g');
    let m: RegExpExecArray | null;
    while ((m = re.exec(plain)) !== null) {
      const square = m[2];
      const piece = at(square);
      const ok = !!piece && piece.type === pieceOf(m[1]);
      claimed.add(m.index + m[0].length - 2);
      refs.push({ square, piece: ok, start: m.index, end: m.index + m[0].length });
      cues.push({
        kind: 'piece', label: text.slice(m.index, m.index + m[0].length),
        squares: [{ square, role: 'piece', blink: true }], arrows: [],
        start: m.index, end: m.index + m[0].length,
      });
    }
  }

  // ── bare piece references: "la dama ataca…" → the piece that just moved, or
  //    the only piece of that kind for the side that moved. ───────────────────
  const mover: ChessColor = chess.turn() === 'w' ? 'b' : 'w';
  const resolveBare = (word: string): string | null => {
    const type = pieceOf(word);
    const last = options.lastMove?.to;
    if (last && at(last)?.type === type) return last;
    const found: string[] = [];
    for (const row of chess.board()) for (const p of row) if (p && p.type === type && p.color === mover) found.push(p.square);
    return found.length === 1 ? found[0] : null;
  };
  {
    const re = new RegExp(`\\b(?:el|la|su|al|del|the|his|her|its|der|die|das|den|dem|seine?n?|ihre?n?)\\s+(${PIECE_RE})\\b(?!\\s+(?:${COLOUR_RE})?\\s*${ON_RE}[a-h][1-8])`, 'g');
    let m: RegExpExecArray | null;
    while ((m = re.exec(plain)) !== null) {
      // Kept even when it cannot be resolved yet: as the OBJECT of a verb it is
      // looked up among the pieces the acting piece really reaches.
      refs.push({ square: resolveBare(m[1]) ?? '', bare: pieceOf(m[1]), piece: true, start: m.index, end: m.index + m[0].length });
    }
  }

  // ── plain square mentions: "la casilla f7", "mate en f7" ──────────────────
  const mentions: Ref[] = [];
  {
    const re = /(?<![a-z0-9])([a-h][1-8])(?![0-9a-z])/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(plain)) !== null) {
      if (claimed.has(m.index) || inMove(m.index)) continue;
      // "a2-g8" belongs to a line phrase, handled below.
      if (/^[-–—]\s*[a-h][1-8]/.test(plain.slice(m.index + 2)) || /[a-h][1-8]\s*[-–—]\s*$/.test(plain.slice(0, m.index))) continue;
      mentions.push({ square: m[1], piece: false, start: m.index, end: m.index + 2 });
      cues.push({
        kind: 'square', label: m[1], squares: [{ square: m[1], role: 'mention' }], arrows: [],
        start: m.index, end: m.index + 2,
      });
    }
  }

  // ── lines ─────────────────────────────────────────────────────────────────
  const addLine = (squares: string[], start: number, end: number) => {
    if (squares.length === 0) return;
    cues.push({
      kind: 'line', label: text.slice(start, end),
      squares: squares.map((square) => ({ square, role: 'line' as const })), arrows: [],
      start, end,
    });
  };
  for (const m of plain.matchAll(/diagonale?\s+([a-h][1-8])\s*[-–—]\s*([a-h][1-8])/g)) {
    addLine(lineSquares(m[1], m[2]), m.index!, m.index! + m[0].length);
  }
  for (const m of plain.matchAll(/gran diagonal|long diagonal/g)) {
    const a = lineSquares('a1', 'h8');
    const b = lineSquares('h1', 'a8');
    const near = [...refs.map((r) => r.square), options.lastMove?.to ?? ''];
    addLine(near.some((s) => b.includes(s)) && !near.some((s) => a.includes(s)) ? b : a, m.index!, m.index! + m[0].length);
  }
  for (const m of plain.matchAll(/columna\s+([a-h])(?![a-z0-9])|(?<![a-z])([a-h])[- ]file\b|(?<![a-z])([a-h])-linie\b/g)) {
    const f = m[1] ?? m[2] ?? m[3];
    addLine(lineSquares(`${f}1`, `${f}8`), m.index!, m.index! + m[0].length);
  }
  for (const m of plain.matchAll(/(primera|segunda|tercera|cuarta|quinta|sexta|septima|octava)\s+(?:fila|linea|horizontal)|fila\s+([1-8])|(first|second|third|fourth|fifth|sixth|seventh|eighth)\s+rank|([1-8])(?:st|nd|rd|th)\s+rank/g)) {
    const r = m[2] ?? m[4] ?? String(ORDINALS[m[1] ?? m[3]]);
    addLine(lineSquares(`a${r}`, `h${r}`), m.index!, m.index! + m[0].length);
  }

  // ── the centre: exactly d4, e4, d5, e5 ────────────────────────────────────
  for (const m of plain.matchAll(/\b(?:centro|centre|center|zentrums?)\b/g)) {
    cues.push({
      kind: 'area', label: text.slice(m.index!, m.index! + m[0].length),
      squares: ['d4', 'e4', 'd5', 'e5'].map((square) => ({ square, role: 'mention' as const })), arrows: [],
      start: m.index!, end: m.index! + m[0].length,
    });
  }

  // ── a piece travelling to a square: show the way, hop by hop ──────────────
  {
    const re = new RegExp(
      `\\b(${PIECE_RE})(?:\\s+${ON_RE}([a-h][1-8]))?[^.;]{0,40}?\\b(?:salt[ao]\\w*|se dirige|dirigirse|viaj\\w+|ruta|camino|rumbo|lleg\\w+|heads?|heading|jumps?|hops?|route|manoeuvres?|maneuvers?|springt|wandert|strebt)\\b[^.;]{0,30}?\\b(?:a|hasta|hacia|to|towards?|nach|auf)\\s+(?:(?:la\\s+|the\\s+|das\\s+)?(?:casilla|square|feld)\\s+)?([a-h][1-8])(?![0-9a-z])`, 'g');
    let m: RegExpExecArray | null;
    while ((m = re.exec(plain)) !== null) {
      const origin = m[2] ?? resolveBare(m[1]);
      if (!origin || !at(origin)) continue;
      const path = piecePath(chess, origin, m[3]);
      if (path.length < 2) continue;
      cues.push({
        kind: 'route', label: text.slice(m.index, m.index + m[0].length),
        squares: path.map((square, i) => ({
          square, role: i === 0 ? 'from' as const : i === path.length - 1 ? 'to' as const : 'mention' as const,
        })),
        arrows: path.slice(1).map((to, i) => ({ from: path[i], to, role: 'to' as const })),
        start: m.index, end: m.index + m[0].length,
      });
    }
  }

  // ── relations, sentence by sentence ───────────────────────────────────────
  const ATTACK = /atac|amenaz|apunta|presion|captur|attack|threat|aim|hit|greift|angreif|bedroh|droht/;
  const DEFEND = /defiend|defend|proteg|protect|cubre|cover|control|sostien|guard|verteidig|deckt|schutz|beherrsch|kontroll/;
  const PASSIVE = /(clavad[ao]s?|atacad[ao]s?|defendid[ao]s?|protegid[ao]s?)\s+por|(pinned|attacked|defended|protected|covered)\s+by|(gefesselt|angegriffen|gedeckt|verteidigt)\s+(?:von|durch)/;
  // A relation needs its SUBJECT before the verb, in the same clause: "X ataca
  // Y". Two pieces that are objects of different verbs ("sostienen el peón de
  // e5, pero encierran al alfil de f8") are not related. A verb with no subject
  // at the head of a clause ("Defiende f7") speaks of the piece that just moved.
  const CLAUSE = /[,;:]|[.!?](?=\s)|\s(?:pero|but|mientras|while)\s/g;
  const bounds: number[] = [0];
  for (const m of plain.matchAll(CLAUSE)) bounds.push(m.index! + m[0].length);
  bounds.push(plain.length);
  for (let k = 0; k + 1 < bounds.length; k++) {
    const start = bounds[k];
    const end = bounds[k + 1];
    const clause = plain.slice(start, end);
    const inside = (r: Ref) => r.start >= start && r.start < end;
    const pieces = refs.filter(inside).sort((a, b) => a.start - b.start);
    const squares = mentions.filter(inside);
    const passive = PASSIVE.exec(clause);
    const verb = passive ?? ATTACK.exec(clause) ?? DEFEND.exec(clause);
    if (!verb) continue;
    const at0 = start + verb.index;
    const defend = passive
      ? /defendid|protegid|defended|protected|covered|gedeckt|verteidigt/.test(passive[0])
      : !ATTACK.test(clause);

    let agents: Ref[];
    let targets: Ref[];
    if (passive) {
      // "X está clavado por Y": Y acts on X.
      agents = pieces.filter((p) => p.start > at0).slice(0, 1);
      targets = pieces.filter((p) => p.start < at0).slice(-1);
    } else {
      agents = pieces.filter((p) => p.end <= at0);
      const headless = agents.length === 0 && !/[a-z]/.test(plain.slice(start, at0));
      if (headless && options.lastMove) {
        agents = [{ square: options.lastMove.to, piece: true, start: at0, end: at0 }];
      }
      targets = [...pieces, ...squares].filter((t) => t.start > at0).sort((a, b) => a.start - b.start);
    }
    agents = agents.filter((a) => a.square && at(a.square));
    // A piece named without a square is the one the acting piece really reaches
    // in one move: an ENEMY piece when it attacks, a friendly one when it defends.
    targets = targets.flatMap((t) => {
      if (!t.bare || passive) return t.square ? [t] : [];
      const found = new Set<string>();
      for (const a of agents) {
        const side = at(a.square)!.color;
        for (const square of attacksFrom(chess, a.square)) {
          const p = at(square);
          if (p && p.type === t.bare && (p.color === side) === defend) found.add(square);
        }
      }
      return [...found].sort().map((square) => ({ ...t, square }));
    });
    targets = targets.filter((t) => !agents.some((a) => a.square === t.square));
    if (agents.length === 0 || targets.length === 0) continue;
    const agentRole: CueRole = defend ? 'defender' : 'attacker';
    const targetRole: CueRole = defend ? 'piece' : 'target';
    const concept = passive && /clavad|pinned|gefesselt/.test(passive[0]) ? 'pin'
      : !defend && targets.length >= 2 && agents.length === 1 ? 'double-attack' : undefined;
    cues.push({
      kind: 'relation',
      label: text.slice(start, end).trim(),
      squares: [
        ...agents.map((a) => ({ square: a.square, role: agentRole, blink: true })),
        ...targets.map((t) => ({ square: t.square, role: targetRole, blink: true })),
      ],
      arrows: agents.flatMap((a) => targets.map((t) => ({ from: a.square, to: t.square, role: agentRole }))),
      ...(concept ? { concept } : {}),
      start, end,
    });
  }

  // ── concepts, with the structure computed when the text gives no squares ──
  for (const hit of findConcepts(text)) {
    const structure = pawnStructure(chess, hit.id, plain);
    if (structure.length > 0) {
      cues.push({
        kind: 'structure', label: hit.title.es, concept: hit.id,
        squares: structure.map((square) => ({ square, role: 'pawn' as const, blink: true })), arrows: [],
        start: hit.start, end: hit.end,
      });
    } else if (!cues.some((c) => c.concept === hit.id)) {
      cues.push({ kind: 'concept', label: hit.title.es, concept: hit.id, squares: [], arrows: [], start: hit.start, end: hit.end });
    }
  }

  return cues.sort((a, b) => a.start - b.start);
}

/** Pawns that form the named structure in the position (empty if not a pawn concept). */
function pawnStructure(chess: Chess, concept: string, plain: string): string[] {
  if (!['doubled-pawns', 'isolated-pawn', 'passed-pawn', 'connected-pawns'].includes(concept)) return [];
  const pawns: { square: string; color: ChessColor }[] = [];
  for (const row of chess.board()) for (const p of row) if (p && p.type === 'p') pawns.push({ square: p.square, color: p.color });
  const sides: ChessColor[] =
    /blanc|white/.test(plain) && !/negr|black/.test(plain) ? ['w']
    : /negr|black/.test(plain) && !/blanc|white/.test(plain) ? ['b']
    : ['w', 'b'];
  const out: string[] = [];
  for (const color of sides) {
    const mine = pawns.filter((p) => p.color === color);
    const theirs = pawns.filter((p) => p.color !== color);
    for (const p of mine) {
      const f = fileOf(p.square);
      const r = rankOf(p.square);
      const neighbours = mine.filter((o) => Math.abs(fileOf(o.square) - f) === 1);
      const ok =
        concept === 'doubled-pawns' ? mine.some((o) => o !== p && fileOf(o.square) === f)
        : concept === 'isolated-pawn' ? neighbours.length === 0
        : concept === 'connected-pawns' ? neighbours.some((o) => Math.abs(rankOf(o.square) - r) <= 1)
        : !theirs.some((o) => Math.abs(fileOf(o.square) - f) <= 1 && (color === 'w' ? rankOf(o.square) > r : rankOf(o.square) < r));
      if (ok) out.push(p.square);
    }
  }
  return out.sort();
}

const STEPS: Record<string, [number, number][]> = {
  n: [[1, 2], [2, 1], [2, -1], [1, -2], [-1, -2], [-2, -1], [-2, 1], [-1, 2]],
  k: [[1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1]],
  b: [[1, 1], [1, -1], [-1, 1], [-1, -1]],
  r: [[1, 0], [-1, 0], [0, 1], [0, -1]],
};
STEPS.q = [...STEPS.b, ...STEPS.r];
const onBoard = (f: number, r: number) => f >= 0 && f < 8 && r >= 0 && r < 8;

/** Squares the piece on `square` attacks in the position (blockers respected). */
export function attacksFrom(chess: Chess, square: string): string[] {
  const piece = chess.get(square as Square);
  if (!piece) return [];
  const f = fileOf(square);
  const r = rankOf(square);
  const out: string[] = [];
  if (piece.type === 'p') {
    const dr = piece.color === 'w' ? 1 : -1;
    for (const df of [-1, 1]) if (onBoard(f + df, r + dr)) out.push(sq(f + df, r + dr));
    return out;
  }
  const slider = 'bqr'.includes(piece.type);
  for (const [df, dr] of STEPS[piece.type]) {
    let nf = f + df;
    let nr = r + dr;
    while (onBoard(nf, nr)) {
      out.push(sq(nf, nr));
      if (!slider || chess.get(sq(nf, nr) as Square)) break;
      nf += df;
      nr += dr;
    }
  }
  return out;
}

/** Shortest way for the piece on `from` to reach `to` by its own moves, on the
 *  board as it stands (own pieces block; the other side does not move). */
export function piecePath(chess: Chess, from: string, to: string): string[] {
  const piece = chess.get(from as Square);
  if (!piece || piece.type === 'p' || from === to) return [];
  const board = new Chess(chess.fen());
  const prev = new Map<string, string | null>([[from, null]]);
  const queue = [from];
  while (queue.length > 0) {
    const cur = queue.shift()!;
    if (cur === to) break;
    // Stand the piece on `cur` to read its reach from there.
    const saved = board.get(cur as Square);
    if (cur !== from) { board.remove(from as Square); board.put(piece, cur as Square); }
    const reach = attacksFrom(board, cur).filter((s) => {
      const p = s === from ? undefined : chess.get(s as Square);
      return !p || p.color !== piece.color;
    });
    if (cur !== from) { board.remove(cur as Square); if (saved) board.put(saved, cur as Square); board.put(piece, from as Square); }
    for (const next of reach) {
      if (prev.has(next)) continue;
      prev.set(next, cur);
      queue.push(next);
    }
  }
  if (!prev.has(to)) return [];
  const path: string[] = [];
  for (let s: string | null = to; s; s = prev.get(s) ?? null) path.unshift(s);
  return path;
}

/** The cue of a move itself: origin, destination, capture, castling, check. */
export function moveCue(move: { san: string; from: string; to: string; fen: string; quality?: MoveQuality }): BoardCue {
  const squares: CueSquare[] = [];
  const castle = /^O-O/.test(move.san);
  const capture = move.san.includes('x');
  squares.push({ square: move.from, role: 'from' });
  squares.push({ square: move.to, role: move.quality ? QUALITY_ROLE[move.quality] : capture ? 'capture' : 'to' });
  if (castle) {
    const rank = move.to[1];
    const long = move.san.startsWith('O-O-O');
    squares.push({ square: `${long ? 'a' : 'h'}${rank}`, role: 'from' });
    squares.push({ square: `${long ? 'd' : 'f'}${rank}`, role: 'to' });
  }
  if (/[+#]/.test(move.san)) {
    const chess = new Chess(move.fen);
    for (const row of chess.board()) {
      for (const p of row) if (p && p.type === 'k' && p.color === chess.turn()) squares.push({ square: p.square, role: 'check', blink: true });
    }
  }
  return {
    kind: 'move', label: move.san, squares,
    arrows: [{ from: move.from, to: move.to, role: 'to' }],
    ...(castle ? { concept: 'castling' } : {}),
    ...(move.quality ? { quality: move.quality } : {}),
    start: 0, end: 0,
  };
}
