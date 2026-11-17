/**
 * Game review: how well each side played, measured against an engine, and the
 * commentary a coach would add.
 *
 * Everything here is pure: the caller supplies, for every move, the engine's
 * evaluation of the position before and after it (and the engine's own choice).
 * From that come the accuracy of each player, the quality of each move, the key
 * moments, the tactical motifs a move creates, and an annotated text of the
 * game that the reader can open like any other book page.
 */

import { Chess, type Square, type PieceSymbol, type Color as ChessColor } from 'chess.js';
import { attacksFrom, type MoveQuality } from './commentCues.js';
import type { Lang } from './concepts.js';
import { OPENING_SQUARES } from './openingSquares.js';
import { positionIdeas } from './positionIdeas.js';

/** Engine evaluation from White's point of view. */
export interface Score {
  cp?: number;
  /** Mate in N: positive = White mates, negative = Black mates. */
  mate?: number;
}

export interface PlyInput {
  nodeId: string;
  san: string;
  color: 'white' | 'black';
  moveNumber: number;
  from: string;
  to: string;
  fenBefore: string;
  fenAfter: string;
  /** Evaluation of the position before / after the move. */
  before: Score;
  after: Score;
  /** The engine's choice in the position before the move, with its line (SAN). */
  best?: { san: string; line: string[] };
}

/** Chance of winning for White, 0–100 (the curve Lichess uses). */
export function winPercent(score: Score): number {
  if (score.mate !== undefined) return score.mate > 0 ? 100 : score.mate < 0 ? 0 : 50;
  const cp = Math.max(-1000, Math.min(1000, score.cp ?? 0));
  return 50 + 50 * (2 / (1 + Math.exp(-0.00368208 * cp)) - 1);
}

/** Accuracy of one move from the winning chances it gave away (0–100). */
export function moveAccuracy(loss: number): number {
  if (loss <= 0) return 100;
  return Math.max(0, Math.min(100, 103.1668 * Math.exp(-0.04354 * loss) - 3.1669));
}

export type MotifKind =
  | 'capture' | 'check' | 'mate' | 'castle' | 'promotion' | 'en-passant'
  | 'fork' | 'pin' | 'skewer' | 'sacrifice' | 'exchange-sacrifice'
  | 'discovered-check' | 'double-check' | 'joint-attack' | 'mate-threat' | 'late-value'
  | 'attack-undefended' | 'wins-material' | 'discovered-attack' | 'outpost' | 'open-file'
  | 'passed-pawn' | 'battery' | 'x-ray' | 'leaves-hanging'
  | 'threat' | 'pawn-sacrifice' | 'prepares-castling'
  | 'aims-at' | 'overloaded' | 'traps' | 'combination' | 'positional-sacrifice' | 'key-square';

export interface Motif {
  kind: MotifKind;
  /** The acting piece's square (after the move). */
  square: string;
  /** Squares involved: attacked pieces, the pinned piece and the one behind… */
  squares: string[];
  /** Extra data for the wording (piece letters, move numbers). */
  data?: Record<string, string | number>;
}

const VALUE: Record<PieceSymbol, number> = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 100 };
const stripMarks = (san: string) => san.replace(/[+#!?]+$/g, '');

/** Material of `color` minus the opponent's (kings left out). */
function balance(chess: Chess, color: ChessColor): number {
  let s = 0;
  for (const row of chess.board()) for (const p of row) if (p && p.type !== 'k') s += (p.color === color ? 1 : -1) * VALUE[p.type];
  return s;
}

export interface MotifContext {
  /** The position before the opponent's previous move: tells a recapture from a gain. */
  prevFen?: string;
}

/** Tactical motifs the move creates, read from the board alone. */
export function moveMotifs(fenBefore: string, san: string, context: MotifContext = {}): Motif[] {
  const chess = new Chess(fenBefore);
  let m;
  try { m = chess.move(stripMarks(san)); } catch { return []; }
  const out: Motif[] = [];
  const me: ChessColor = m.color;
  const foe: ChessColor = me === 'w' ? 'b' : 'w';
  const at = (s: string) => chess.get(s as Square);
  const add = (kind: MotifKind, squares: string[] = [], data?: Record<string, string | number>) =>
    out.push({ kind, square: m.to, squares, ...(data ? { data } : {}) });

  if (chess.isCheckmate()) add('mate');
  if (m.isKingsideCastle() || m.isQueensideCastle()) add('castle');
  if (m.promotion) add('promotion', [], { piece: m.promotion });
  if (m.isEnPassant()) add('en-passant');
  if (m.captured) add('capture', [], { piece: m.captured });

  const reach = attacksFrom(chess, m.to);
  if (chess.isCheck() && !chess.isCheckmate()) {
    const king = reach.find((s) => at(s)?.type === 'k' && at(s)!.color === foe);
    const checkers = chess.attackers(findKing(chess, foe) as Square, me);
    if (checkers.length >= 2) add('double-check', checkers);
    else if (!king) add('discovered-check', checkers);
    else add('check');
  }

  const moved = at(m.to);
  // The moved piece is simply lost next move (taken for nothing, or by something
  // cheaper): what it "attacks" or "pins" from there is no real threat.
  const takersOfMoved = moved ? chess.attackers(m.to as Square, foe) : [];
  const lost = !!moved && moved.type !== 'k' && !chess.isCheckmate() && takersOfMoved.length > 0
    && (chess.attackers(m.to as Square, me).length === 0 || Math.min(...takersOfMoved.map((s) => VALUE[at(s)!.type])) < VALUE[moved.type]);

  // Sacrifice: the piece can be taken and is worth clearly more than what it took.
  if (moved && moved.type !== 'k' && !chess.isCheckmate()) {
    const takers = chess.attackers(m.to as Square, foe);
    const got = m.captured ? VALUE[m.captured] : 0;
    const cheapest = Math.min(...takers.map((s) => VALUE[at(s)!.type]));
    const defended = chess.attackers(m.to as Square, me).length > 0;
    if (takers.length > 0 && VALUE[moved.type] - got >= 2 && (!defended || cheapest < VALUE[moved.type])) {
      if (moved.type === 'r' && (m.captured === 'b' || m.captured === 'n')) add('exchange-sacrifice', takers);
      else add('sacrifice', takers, { piece: moved.type });
    }
  }

  // Fork: the moved piece attacks two or more pieces worth taking, and is not simply lost.
  if (moved) {
    const targets = forkTargets(chess, m.to);
    if (targets.length >= 2) add('fork', targets, { piece: moved.type });
  }

  // Pin / skewer along the lines of a bishop, rook or queen.
  if (moved && 'bqr'.includes(moved.type) && !lost) {
    const f0 = m.to.charCodeAt(0) - 97;
    const r0 = Number(m.to[1]) - 1;
    const dirs = moved.type === 'b' ? DIAG : moved.type === 'r' ? ORTH : [...DIAG, ...ORTH];
    for (const [df, dr] of dirs) {
      const seen: string[] = [];
      for (let f = f0 + df, r = r0 + dr; f >= 0 && f < 8 && r >= 0 && r < 8 && seen.length < 2; f += df, r += dr) {
        const s = `${'abcdefgh'[f]}${r + 1}`;
        if (at(s)) seen.push(s);
      }
      // Two pieces lined up (a "battery"): the next piece on the line is an own
      // queen/rook/bishop that moves along it — and the doubled line aims at
      // something (an enemy piece, a pawn by the king, the king). Lined up
      // pointing at nothing is not worth a remark.
      const along = (t: PieceSymbol) => t === 'q' || (df === 0 || dr === 0 ? t === 'r' : t === 'b');
      const first = seen[0] ? at(seen[0])! : null;
      if (first && first.color === me && along(first.type) && !out.some((x) => x.kind === 'battery')) {
        const aim = lineTarget(chess, seen[0], df, dr, foe) ?? lineTarget(chess, m.to, -df, -dr, foe);
        // Doubled on a file without own pawns: the line is theirs to use.
        const file = df === 0 && ![1, 2, 3, 4, 5, 6, 7, 8].some((r) => {
          const q = at(`${m.to[0]}${r}`);
          return q?.type === 'p' && q.color === me;
        });
        if (aim || file) add('battery', [seen[0], aim ?? '', ...fullLine(seen[0], m.to, df, dr)], { piece: first.type });
      }
      if (seen.length < 2) continue;
      const [front, behind] = seen.map((s) => at(s)!);
      if (front.color !== foe || behind.color !== foe) continue;
      // X-ray: the piece in front moves along this very line, so the slider acts through it.
      if (along(front.type) && front.type !== 'k') add('x-ray', seen, { piece: front.type, behind: behind.type });
      if (VALUE[behind.type] > VALUE[front.type] && front.type !== 'p') add('pin', seen, { piece: front.type, behind: behind.type });
      else if (VALUE[front.type] > VALUE[behind.type] && VALUE[front.type] > VALUE[moved.type]) add('skewer', seen, { piece: front.type, behind: behind.type });
    }
  }

  // ── ideas read from the position before and after ────────────────────────
  const before = new Chess(fenBefore);
  const ideasAfter = positionIdeas(chess.fen());
  const ideasBefore = positionIdeas(fenBefore);
  if (moved && !chess.isCheckmate()) {
    const safe = chess.attackers(m.to as Square, foe).length === 0 || chess.attackers(m.to as Square, me).length > 0;
    // A threat: the moved piece now attacks a piece nothing defends.
    const targets = reach.filter((s) => {
      const p = at(s);
      return p && p.color === foe && p.type !== 'k' && p.type !== 'p' && chess.attackers(s as Square, foe).length === 0
        && !attacksFrom(before, m.from).includes(s);
    });
    if (targets.length > 0 && safe && !lost) add('attack-undefended', targets.sort());
    // Material won on the spot: something taken that cannot be taken back, or worth more than the taker.
    // Taking back what the opponent just took is an exchange, not a gain:
    // count the material across both moves.
    let recapture = false;
    if (m.captured && context.prevFen) {
      try {
        const prev = new Chess(context.prevFen);
        if (balance(prev, me) > balance(before, me)) recapture = balance(chess, me) - balance(prev, me) < 1;
      } catch { /* not a position */ }
    }
    // …nor when the reply takes back as much somewhere else.
    const regain = bestFreeCapture(chess);
    if (m.captured && !recapture && regain < VALUE[m.captured] && (chess.attackers(m.to as Square, foe).length === 0 || VALUE[m.captured] > VALUE[moved.type])) {
      add('wins-material', [], { piece: m.captured });
    }
    // Discovered attack: a slider behind the moved piece now hits something worth taking.
    for (const row of chess.board()) {
      for (const p of row) {
        if (!p || p.color !== me || !'bqr'.includes(p.type) || p.square === m.to) continue;
        const was = attacksFrom(before, p.square);
        for (const s of attacksFrom(chess, p.square)) {
          const t = at(s);
          if (!t || t.color !== foe || t.type === 'k' || was.includes(s)) continue;
          if (VALUE[t.type] > VALUE[p.type] || chess.attackers(s as Square, foe).length === 0) add('discovered-attack', [p.square, s], { piece: t.type });
        }
      }
    }
    if (ideasAfter.outposts.some((o) => o.square === m.to) && !ideasBefore.outposts.some((o) => o.square === m.from)) add('outpost');
    if (moved.type === 'r' && m.from[0] !== m.to[0]
      && (ideasAfter.openFiles.includes(m.to[0]) || ideasAfter.halfOpenFiles.some((h) => h.file === m.to[0] && h.for === (me === 'w' ? 'white' : 'black')))) {
      add('open-file', [], { file: m.to[0] });
    }
    if (moved.type === 'p') {
      const isPassed = ideasAfter.passedPawns.some((p) => p.square === m.to);
      const wasPassed = ideasBefore.passedPawns.some((p) => p.square === m.from);
      const far = me === 'w' ? Number(m.to[1]) >= 6 : Number(m.to[1]) <= 3;
      if (isPassed && (!wasPassed || far)) add('passed-pawn');
    }
    // A pawn pushed where it can simply be taken: a pawn sacrifice (or a slip).
    if (moved.type === 'p' && !m.captured && !m.promotion) {
      const takers = chess.attackers(m.to as Square, foe);
      if (takers.length > 0 && takers.length > chess.attackers(m.to as Square, me).length) add('pawn-sacrifice', takers.sort());
    }
    // The last piece between king and rook leaves: castling is now possible.
    const rights = fenBefore.split(' ')[2];
    const home = me === 'w' ? '1' : '8';
    for (const [flag, files] of [[me === 'w' ? 'K' : 'k', 'fg'], [me === 'w' ? 'Q' : 'q', 'bcd']] as const) {
      if (!rights.includes(flag) || m.piece === 'k' || !files.includes(m.from[0]) || m.from[1] !== home) continue;
      if ([...files].every((f) => !at(`${f}${home}`))) add('prepares-castling', [], { side: flag.toLowerCase() === 'k' ? 'short' : 'long' });
    }
    // A capture that leaves the mover a file without own pawns: a line for the rooks.
    const hasRook = chess.board().some((row) => row.some((p) => p?.color === me && p.type === 'r'));
    if (m.captured && hasRook && (moved.type === 'p' || m.captured === 'p')) {
      const mineNow = (h: { file: string; for: string }) => h.for === (me === 'w' ? 'white' : 'black');
      const opened = [...ideasAfter.openFiles, ...ideasAfter.halfOpenFiles.filter(mineNow).map((h) => h.file)]
        .filter((f) => !ideasBefore.openFiles.includes(f) && !ideasBefore.halfOpenFiles.some((h) => h.file === f && mineNow(h)));
      for (const file of opened) if (!out.some((x) => x.kind === 'open-file')) add('open-file', [], { file });
    }
    // Threats: what the mover would do if it could move again — and could not do before.
    if (!chess.isCheck()) {
      const fresh = threatsOf(chess.fen(), me);
      if (fresh.length > 0) {
        const old = new Set(threatsOf(fenBefore, me, true).map((t) => `${t.type}:${t.target}`));
        for (const t of fresh) {
          if (old.has(`${t.type}:${t.target}`)) continue;
          if (lost && t.from === m.to) continue;
          add('threat', [t.target], { type: t.type, ...(t.piece ? { piece: t.piece } : {}), from: t.from });
        }
      }
    }
    // The move leaves another own piece hanging that was safe before.
    const mine = me === 'w' ? 'white' : 'black';
    const newly = ideasAfter.hanging.filter((h) => h.color === mine && h.square !== m.to && h.piece !== 'p'
      && (!ideasBefore.hanging.some((b) => b.square === h.square)
        // …or it was only "attacked by something cheaper" and has now lost its last defender.
        || ((ideasBefore.pieces.find((b) => b.square === h.square)?.defenders.length ?? 0) > 0
          && (ideasAfter.pieces.find((b) => b.square === h.square)?.defenders.length ?? 0) === 0)));
    if (newly.length > 0) add('leaves-hanging', newly.map((h) => h.square));
  }

  // Pieces attacking one point together: the moved piece plus others, outnumbering the defence.
  if (moved && !lost && !out.some((x) => x.kind === 'fork' || x.kind === 'mate')) {
    let bestSquare: string | null = null;
    let bestValue = 0;
    let bestAttackers: string[] = [];
    for (const s of reach) {
      const p = at(s);
      if (!p || p.color !== foe || p.type === 'k') continue;
      // A pawn only counts next to its king (f7, h2…) or when the move joins an
      // attack on it already under way: elsewhere it is routine.
      const king = findKing(chess, foe);
      const prior = before.attackers(s as Square, me).filter((a) => a !== m.from);
      const byKing = Math.abs(s.charCodeAt(0) - king.charCodeAt(0)) <= 1 && Math.abs(Number(s[1]) - Number(king[1])) <= 1;
      if (p.type === 'p' && !byKing && prior.length === 0) continue;
      const attackers = chess.attackers(s as Square, me);
      const defenders = chess.attackers(s as Square, foe);
      if (attackers.length >= 2 && attackers.length > defenders.filter((d) => at(d)!.type !== 'k').length && VALUE[p.type] >= bestValue) {
        bestSquare = s; bestValue = VALUE[p.type]; bestAttackers = attackers;
      }
    }
    if (bestSquare) {
      const prior = before.attackers(bestSquare as Square, me).filter((a) => a !== m.from && attacksFrom(before, a).includes(bestSquare!));
      add('joint-attack', [bestSquare, ...bestAttackers.sort()], {
        piece: at(bestSquare)!.type, count: bestAttackers.length,
        ...(prior.length && !attacksFrom(before, m.from).includes(bestSquare) ? { prior: prior.sort().join(',') } : {}),
      });
    }
  }

  // Overloaded: the moved piece is now the only defender of two or more attacked pieces.
  if (moved && moved.type !== 'k' && !chess.isCheckmate()) {
    const held: string[] = [];
    for (const row of chess.board()) for (const p of row) {
      if (!p || p.color !== me || p.type === 'k' || p.square === m.to) continue;
      if (chess.attackers(p.square, foe).length === 0) continue;
      const defenders = chess.attackers(p.square, me);
      if (defenders.length === 1 && defenders[0] === m.to) held.push(p.square);
    }
    if (held.length >= 2) add('overloaded', [m.to, ...held.sort()], { piece: moved.type });
    // The opponent: one of its pieces is now the only guard of two attacked pieces.
    const guards = new Map<string, string[]>();
    for (const row of chess.board()) for (const q of row) {
      if (!q || q.color !== foe || q.type === 'k' || chess.attackers(q.square, me).length === 0) continue;
      const d = chess.attackers(q.square, foe);
      if (d.length === 1 && chess.get(d[0])!.type !== 'k') guards.set(d[0], [...(guards.get(d[0]) ?? []), q.square]);
    }
    for (const [guard, pieces] of guards) {
      if (pieces.length < 2) continue;
      const was = pieces.filter((s2) => before.attackers(s2 as Square, me).length > 0 && before.attackers(s2 as Square, foe).length === 1).length;
      if (was >= 2) continue;
      add('overloaded', [guard, ...pieces.sort()], { piece: chess.get(guard as Square)!.type, side: 'foe' });
    }
  }

  // Trapped: an enemy piece is now threatened and none of its moves leads to safety.
  if (moved && !chess.isCheckmate() && !chess.isCheck()) {
    for (const row of chess.board()) for (const p of row) {
      if (!p || p.color !== foe || !'nbrq'.includes(p.type)) continue;
      if (!threatened(chess, p.square, p.type, foe) || threatened(before, p.square, p.type, foe)) continue;
      // Trapped only if no reply at all (moving it, blocking, taking the
      // attacker, defending it) leaves it safe.
      const escapes = chess.moves({ verbose: true }).some((mv) => {
        if (mv.from === p.square && mv.captured && VALUE[mv.captured] >= VALUE[p.type]) return true;
        chess.move(mv);
        const where = mv.from === p.square ? mv.to : p.square;
        // …without giving up the piece that does the saving.
        const helper = mv.from === p.square || (mv.captured && VALUE[mv.captured] >= VALUE[mv.piece]) || !threatened(chess, mv.to, mv.piece, foe);
        const safe = helper && !threatened(chess, where, p.type, foe);
        chess.undo();
        return safe;
      });
      if (!escapes) add('traps', [p.square], { piece: p.type });
    }
  }
  return out;
}

/** The most the side to move wins with one capture (value taken minus the taker when it is defended). */
function bestFreeCapture(chess: Chess): number {
  let best = 0;
  for (const mv of chess.moves({ verbose: true })) {
    if (!mv.captured) continue;
    const defended = chess.attackers(mv.to as Square, chess.turn() === 'w' ? 'b' : 'w').length > 0;
    best = Math.max(best, VALUE[mv.captured] - (defended ? VALUE[mv.piece] : 0));
  }
  return best;
}

/** The piece of `color` on `square` can be taken for nothing, or by something cheaper. */
function threatened(chess: Chess, square: string, type: PieceSymbol, color: ChessColor): boolean {
  const foe: ChessColor = color === 'w' ? 'b' : 'w';
  const takers = chess.attackers(square as Square, foe);
  if (takers.length === 0) return false;
  if (chess.attackers(square as Square, color).length === 0) return true;
  return Math.min(...takers.map((s) => VALUE[chess.get(s)!.type])) < VALUE[type];
}

/** Pieces the piece on `square` forks: two or more worth taking, with the forker not simply lost. */
function forkTargets(chess: Chess, square: string): string[] {
  const piece = chess.get(square as Square);
  if (!piece) return [];
  const foe: ChessColor = piece.color === 'w' ? 'b' : 'w';
  const targets = attacksFrom(chess, square).filter((s) => {
    const p = chess.get(s as Square);
    if (!p || p.color !== foe) return false;
    if (p.type === 'k') return true;
    return VALUE[p.type] > VALUE[piece.type] || chess.attackers(s as Square, foe).length === 0;
  });
  if (targets.length < 2) return [];
  const takers = chess.attackers(square as Square, foe);
  const cheapest = Math.min(...takers.map((s) => VALUE[chess.get(s)!.type]));
  const defended = chess.attackers(square as Square, piece.color).length > 0;
  const giveCheck = targets.some((s) => chess.get(s as Square)!.type === 'k');
  const safe = takers.length === 0 || (defended && cheapest >= VALUE[piece.type]) || (giveCheck && takers.every((s) => chess.get(s)!.type === 'k') && defended);
  return safe || (giveCheck && takers.length === 0) ? targets.sort() : [];
}

interface Threat { type: 'mate' | 'capture' | 'fork' | 'discovered'; target: string; from: string; piece?: PieceSymbol }

/**
 * What `side` would do with a free move in the position: mate, take something
 * for nothing, or fork. `toMove` = the side is really to move (no null move).
 */
function threatsOf(fen: string, side: ChessColor, toMove = false): Threat[] {
  let chess: Chess;
  try {
    if (toMove) chess = new Chess(fen);
    else {
      const parts = fen.split(' ');
      parts[1] = side;
      parts[3] = '-';
      chess = new Chess(parts.join(' '));
    }
  } catch { return []; }
  if (chess.turn() !== side) return [];
  const foe: ChessColor = side === 'w' ? 'b' : 'w';
  const out = new Map<string, Threat>();
  for (const mv of chess.moves({ verbose: true })) {
    chess.move(mv);
    const key = (type: string, target: string) => `${type}:${target}`;
    if (chess.isCheckmate()) {
      out.set(key('mate', mv.to), { type: 'mate', target: mv.to, from: mv.from });
    } else {
      // A discovered check: the king is checked by a piece other than the one that moved.
      if (chess.isCheck()) {
        const king = findKing(chess, foe);
        const checkers = chess.attackers(king as Square, side);
        if (checkers.some((c) => c !== mv.to)) out.set(key('discovered', mv.from), { type: 'discovered', target: mv.from, from: mv.from, piece: mv.piece });
      }
      if (mv.captured && mv.captured !== 'p'
        && (chess.attackers(mv.to as Square, foe).length === 0 || VALUE[mv.captured] > VALUE[mv.piece])) {
        if (!out.has(key('mate', mv.to))) out.set(key('capture', mv.to), { type: 'capture', target: mv.to, from: mv.from, piece: mv.captured });
      }
      if (!mv.captured && (mv.piece === 'n' || mv.piece === 'p' || mv.piece === 'q' || mv.piece === 'b') && forkTargets(chess, mv.to).length >= 2) {
        out.set(key('fork', mv.to), { type: 'fork', target: mv.to, from: mv.from, piece: mv.piece });
      }
    }
    chess.undo();
  }
  // A mate threat says it all: drop the lesser threats on the same square.
  return [...out.values()].filter((t) => t.type === 'mate' || !out.has(`mate:${t.target}`));
}

/** The first piece met from `from` (exclusive) going (df, dr), if it is a target of `foe`'s worth a remark. */
function lineTarget(chess: Chess, from: string, df: number, dr: number, foe: ChessColor): string | null {
  const king = findKing(chess, foe);
  for (let f = from.charCodeAt(0) - 97 + df, r = Number(from[1]) - 1 + dr; f >= 0 && f < 8 && r >= 0 && r < 8; f += df, r += dr) {
    const s = `${'abcdefgh'[f]}${r + 1}`;
    const p = chess.get(s as Square);
    if (!p) continue;
    if (p.color !== foe) return null;
    const byKing = Math.abs(s.charCodeAt(0) - king.charCodeAt(0)) <= 1 && Math.abs(Number(s[1]) - Number(king[1])) <= 1;
    return p.type !== 'p' || byKing ? s : null;
  }
  return null;
}

/** Every square of the line through `a` and `b` (direction (df, dr)), edge to edge. */
function fullLine(a: string, _b: string, df: number, dr: number): string[] {
  const out: string[] = [];
  let f = a.charCodeAt(0) - 97;
  let r = Number(a[1]) - 1;
  while (f - df >= 0 && f - df < 8 && r - dr >= 0 && r - dr < 8) { f -= df; r -= dr; }
  for (; f >= 0 && f < 8 && r >= 0 && r < 8; f += df, r += dr) out.push(`${'abcdefgh'[f]}${r + 1}`);
  return out;
}

/** "la columna d" / "the d-file" / "the diagonal b1-h7" for a full line of squares. */
function lineName(line: string[], lang: Lang): string | null {
  if (line.length < 2) return null;
  const a = line[0], b = line[line.length - 1];
  if (a[0] === b[0]) return lang === 'es' ? `la columna ${a[0]}` : lang === 'en' ? `the ${a[0]}-file` : `der ${a[0]}-Linie`;
  if (a[1] === b[1]) return lang === 'es' ? `la fila ${a[1]}` : lang === 'en' ? `the ${a[1]}${a[1] === '1' ? 'st' : a[1] === '2' ? 'nd' : a[1] === '3' ? 'rd' : 'th'} rank` : `der ${a[1]}. Reihe`;
  const [x, y] = a < b ? [a, b] : [b, a];
  return lang === 'es' ? `la diagonal ${x}-${y}` : lang === 'en' ? `the diagonal ${x}-${y}` : `der Diagonale ${x}-${y}`;
}

const DIAG: [number, number][] = [[1, 1], [1, -1], [-1, 1], [-1, -1]];
const ORTH: [number, number][] = [[1, 0], [-1, 0], [0, 1], [0, -1]];

function findKing(chess: Chess, color: ChessColor): string {
  for (const row of chess.board()) for (const p of row) if (p && p.type === 'k' && p.color === color) return p.square;
  return 'e1';
}

export interface ReviewedMove {
  nodeId: string;
  san: string;
  color: 'white' | 'black';
  moveNumber: number;
  /** Winning chances of the mover before and after (0–100). */
  winBefore: number;
  winAfter: number;
  /** Winning chances given away (never negative). */
  loss: number;
  accuracy: number;
  quality?: MoveQuality;
  /** The better move, when the move played is not the engine's. */
  best?: { san: string; line: string[] };
  motifs: Motif[];
}

export interface PlayerReview {
  accuracy: number;
  moves: number;
  brilliant: number;
  good: number;
  inaccuracies: number;
  mistakes: number;
  blunders: number;
}

export interface KeyMoment {
  nodeId: string;
  moveNumber: number;
  color: 'white' | 'black';
  san: string;
  quality: MoveQuality;
  /** Change in the mover's winning chances (negative = thrown away). */
  swing: number;
  /** The line to look at: the engine's better line, or the continuation after a strong move. */
  line: string[];
}

export interface GameReview {
  moves: ReviewedMove[];
  white: PlayerReview;
  black: PlayerReview;
  keyMoments: KeyMoment[];
}

/**
 * A player's accuracy over a game, as Lichess computes it: the mean of the
 * move accuracies weighted by how volatile the position was around each move
 * (so a slip in a sharp position counts more), averaged with their harmonic
 * mean (so one blunder is not hidden by many easy moves).
 * `wins` is White's winning chances before each of these moves and after the last.
 */
export function playerAccuracy(accuracies: number[], wins: number[]): number {
  if (!accuracies.length) return 0;
  const window = Math.max(2, Math.min(8, Math.floor(wins.length / 10)));
  const weights = accuracies.map((_, i) => {
    const slice = wins.slice(Math.max(0, i - window + 1), i + 2);
    const mean = slice.reduce((a, b) => a + b, 0) / slice.length;
    const sd = Math.sqrt(slice.reduce((a, b) => a + (b - mean) ** 2, 0) / slice.length);
    return Math.max(0.5, Math.min(12, sd));
  });
  const weighted = accuracies.reduce((a, x, i) => a + x * weights[i], 0) / weights.reduce((a, b) => a + b, 0);
  const harmonic = accuracies.length / accuracies.reduce((a, x) => a + 1 / Math.max(x, 1), 0);
  return Math.round(((weighted + harmonic) / 2) * 10) / 10;
}

export function reviewGame(plies: PlyInput[]): GameReview {
  const moves: ReviewedMove[] = plies.map((p, i) => {
    const white = p.color === 'white';
    const view = (s: Score) => (white ? winPercent(s) : 100 - winPercent(s));
    const winBefore = view(p.before);
    const winAfter = view(p.after);
    const loss = Math.max(0, winBefore - winAfter);
    const isBest = !!p.best && stripMarks(p.best.san) === stripMarks(p.san);
    const prev = plies[i - 1];
    const motifs = moveMotifs(p.fenBefore, p.san, prev && prev.fenAfter === p.fenBefore ? { prevFen: prev.fenBefore } : {});
    // A mate threat: the engine now sees a forced mate for the mover.
    const mating = p.after.mate !== undefined && (white ? p.after.mate > 0 : p.after.mate < 0);
    const wasMating = p.before.mate !== undefined && (white ? p.before.mate > 0 : p.before.mate < 0);
    if (mating && !wasMating && !motifs.some((m) => m.kind === 'mate')) {
      motifs.push({ kind: 'mate-threat', square: p.to, squares: [], data: { n: Math.abs(p.after.mate!) } });
    }
    const sacrifice = motifs.some((m) => m.kind === 'sacrifice' || m.kind === 'exchange-sacrifice');
    let quality: MoveQuality | undefined;
    if (loss >= 30) quality = 'blunder';
    else if (loss >= 20) quality = 'mistake';
    else if (loss >= 10) quality = 'dubious';
    else if (sacrifice && loss < 5 && winAfter >= 50) quality = 'brilliant';
    else if (isBest && i > 0 && winAfter - winBefore >= -1 && plies[i - 1] && Math.abs(winBefore - 50) < 35
      && winBefore - (100 - (white ? 100 - winPercent(plies[i - 1].before) : winPercent(plies[i - 1].before))) >= 15) quality = 'good';
    return {
      nodeId: p.nodeId, san: p.san, color: p.color, moveNumber: p.moveNumber,
      winBefore, winAfter, loss, accuracy: moveAccuracy(loss),
      ...(quality ? { quality } : {}),
      ...(p.best && !isBest ? { best: p.best } : {}),
      motifs,
    };
  });

  // A quiet move whose piece, many moves later and without having moved again,
  // strikes: worth pointing out where it was placed.
  const placed = new Map<string, number>(); // square → index of the quiet move that put a piece there
  plies.forEach((p, i) => {
    const earlier = placed.get(p.from);
    const strikes = p.san.includes('#') || moves[i].quality === 'brilliant' || moves[i].quality === 'good';
    if (earlier !== undefined && i - earlier >= 12 && strikes && moves[earlier].color === p.color) {
      moves[earlier].motifs.push({
        kind: 'late-value', square: p.from, squares: [p.to],
        data: { move: p.moveNumber, san: stripMarks(p.san), piece: (/^[KQRBN]/.exec(p.san)?.[0] ?? 'P').toLowerCase() },
      });
    }
    placed.delete(p.from);
    placed.delete(p.to);
    if (!/[x+#=]/.test(p.san) && !p.san.startsWith('O-O')) placed.set(p.to, i);
    else placed.delete(p.to);
  });

  lookAhead(plies, moves);

  const side = (color: 'white' | 'black'): PlayerReview => {
    const own = moves.filter((m) => m.color === color);
    const count = (q: MoveQuality) => own.filter((m) => m.quality === q).length;
    return {
      accuracy: playerAccuracy(own.map((m) => m.accuracy), [
        ...moves.filter((m) => m.color === color).map((m) => (m.color === 'white' ? m.winBefore : 100 - m.winBefore)),
        ...(own.length ? [own[own.length - 1].color === 'white' ? own[own.length - 1].winAfter : 100 - own[own.length - 1].winAfter] : []),
      ]),
      moves: own.length,
      brilliant: count('brilliant'), good: count('good'),
      inaccuracies: count('dubious'), mistakes: count('mistake'), blunders: count('blunder'),
    };
  };

  const keyMoments: KeyMoment[] = moves
    .map((m, i) => ({ m, i }))
    .filter(({ m }) => m.quality === 'blunder' || m.quality === 'mistake' || m.quality === 'brilliant' || m.quality === 'good')
    .map(({ m, i }) => ({
      nodeId: m.nodeId, moveNumber: m.moveNumber, color: m.color, san: m.san, quality: m.quality!,
      swing: Math.round((m.winAfter - m.winBefore) * 10) / 10,
      line: m.best ? m.best.line : plies.slice(i, i + 6).map((p) => stripMarks(p.san)),
    }));

  return { moves, white: side('white'), black: side('black'), keyMoments };
}

/**
 * Ideas only visible from later in the game: the moves that clear the way for
 * a castling still to come, the pieces that gather on the square where the
 * game is decided, and the start of a combination that wins material.
 */
function lookAhead(plies: PlyInput[], moves: ReviewedMove[]) {
  const add = (i: number, motif: Motif) => moves[i].motifs.push(motif);
  // The squares annotators discuss in this opening: the first move fighting
  // for each of them (per side, first 15 moves) says so.
  const sans = plies.map((p) => stripMarks(p.san));
  const family = openingName(sans, 'en')?.split(/[:,]/)[0].trim();
  const keySquares = family ? OPENING_SQUARES[family] ?? [] : [];
  const fought = new Set<string>();
  plies.slice(0, 30).forEach((p, i) => {
    if (!keySquares.length) return;
    const after = new Chess(p.fenAfter);
    const before = new Chess(p.fenBefore);
    const now = new Set([...attacksFrom(after, p.to), p.to]);
    const was = new Set(attacksFrom(before, p.from));
    const sq = keySquares.find((s) => now.has(s) && !was.has(s) && !fought.has(`${p.color}:${s}`));
    if (!sq) return;
    fought.add(`${p.color}:${sq}`);
    add(i, { kind: 'key-square', square: p.to, squares: [sq], data: { opening: family! } });
  });
  plies.forEach((p, j) => {
    const san = stripMarks(p.san);
    // Castling: every earlier move of that side that emptied a square between king and rook.
    if (san === 'O-O' || san === 'O-O-O') {
      const short = san === 'O-O';
      const files = short ? 'fg' : 'bcd';
      const home = p.color === 'white' ? '1' : '8';
      for (let k = 0; k < j; k++) {
        const q = plies[k];
        if (q.color !== p.color || q.from[1] !== home || !files.includes(q.from[0]) || /^[KR]/.test(q.san)) continue;
        const mine = moves[k].motifs.find((m) => m.kind === 'prepares-castling');
        const data = { side: short ? 'short' : 'long', move: p.moveNumber };
        if (mine) mine.data = data;
        else add(k, { kind: 'prepares-castling', square: q.to, squares: [], data });
      }
    }
    // The square where it is decided: a mate, or a winning blow by the enemy king.
    const chess = new Chess(p.fenAfter);
    const foe: ChessColor = p.color === 'white' ? 'b' : 'w';
    const king = findKing(chess, foe);
    const near = Math.abs(p.to.charCodeAt(0) - king.charCodeAt(0)) <= 1 && Math.abs(Number(p.to[1]) - Number(king[1])) <= 1;
    const strong = moves[j].quality === 'brilliant' || moves[j].quality === 'good'
      || moves[j].motifs.some((m) => m.kind === 'sacrifice' || m.kind === 'exchange-sacrifice');
    if (p.san.includes('#') || (p.san.includes('x') && near && strong)) {
      let marked = 0;
      for (let k = j - 1; k >= Math.max(0, j - 16) && marked < 3; k--) {
        const q = plies[k];
        if (q.color !== p.color) continue;
        const then = new Chess(q.fenAfter);
        const was = new Chess(q.fenBefore);
        if (!attacksFrom(then, q.to).includes(p.to) || attacksFrom(was, q.from).includes(p.to)) continue;
        const target = then.get(p.to as Square);
        const k2 = findKing(then, foe);
        const byKing = Math.abs(p.to.charCodeAt(0) - k2.charCodeAt(0)) <= 1 && Math.abs(Number(p.to[1]) - Number(k2[1])) <= 1;
        if (!byKing && !(target && target.color === foe)) continue;
        if (moves[k].motifs.some((m) => m.kind === 'aims-at')) continue;
        add(k, { kind: 'aims-at', square: q.to, squares: [p.to], data: { move: p.moveNumber, near: byKing ? 1 : 0 } });
        marked++;
      }
    }
    // A positional sacrifice: material given on this move (taken by the reply)
    // and still missing several moves later, without the engine objecting.
    {
      const me: ChessColor = p.color === 'white' ? 'w' : 'b';
      const reply = plies[j + 1];
      const late = plies[j + 8];
      if (reply && late && reply.san.includes('x') && !p.san.includes('x') && moves[j].loss < 10
        && !moves[j].motifs.some((m) => m.kind === 'sacrifice' || m.kind === 'exchange-sacrifice')) {
        const b0 = balance(new Chess(p.fenBefore), me);
        const given = b0 - balance(new Chess(reply.fenAfter), me);
        const still = b0 - balance(new Chess(late.fenAfter), me);
        if (given >= 1 && still >= 1) {
          moves[j].motifs = moves[j].motifs.filter((m) => m.kind !== 'pawn-sacrifice');
          add(j, { kind: 'positional-sacrifice', square: p.to, squares: [reply.to], data: { amount: Math.min(given, still) } });
        }
      }
    }
    // A combination: the move keeps (or makes) a big jump in the mover's chances and the
    // game shows the material coming in within a few moves.
    const prev = plies[j - 1];
    const view = (sc: Score) => (p.color === 'white' ? winPercent(sc) : 100 - winPercent(sc));
    const reference = Math.min(moves[j].winBefore, prev ? view(prev.before) : moves[j].winBefore);
    if (moves[j].winAfter - reference >= 20 && moves[j].loss < 5 && p.san.includes('x')) {
      const me: ChessColor = p.color === 'white' ? 'w' : 'b';
      const end = plies[Math.min(plies.length - 1, j + 6)];
      const gain = balance(new Chess(end.fenAfter), me) - balance(new Chess(p.fenBefore), me);
      const mates = plies.slice(j, j + 7).some((q) => q.san.includes('#') && q.color === p.color);
      if (mates || gain >= 2) add(j, { kind: 'combination', square: p.to, squares: [], data: mates ? { mate: 1 } : { gain } });
    }
  });
}

// ── wording ─────────────────────────────────────────────────────────────────

const PIECE: Record<Lang, Record<string, string>> = {
  es: { p: 'peón', n: 'caballo', b: 'alfil', r: 'torre', q: 'dama', k: 'rey' },
  en: { p: 'pawn', n: 'knight', b: 'bishop', r: 'rook', q: 'queen', k: 'king' },
  de: { p: 'Bauer', n: 'Springer', b: 'Läufer', r: 'Turm', q: 'Dame', k: 'König' },
};
const THE: Record<Lang, Record<string, string>> = {
  es: { p: 'el', n: 'el', b: 'el', r: 'la', q: 'la', k: 'el' },
  en: { p: 'the', n: 'the', b: 'the', r: 'the', q: 'the', k: 'the' },
  de: { p: 'der', n: 'der', b: 'der', r: 'der', q: 'die', k: 'der' },
};

const TEXT: Record<Lang, Record<string, string>> = {
  es: {
    blunder: 'Error grave', mistake: 'Error', dubious: 'Imprecisión', brilliant: 'Jugada brillante', good: 'Muy buena jugada',
    better: 'Era mejor', accuracy: 'Precisión', white: 'Blancas', black: 'Negras', opening: 'Apertura',
    and: 'y', lost: 'cede buena parte de la ventaja', losing: 'deja la partida perdida', equal: 'deja escapar la ventaja',
    keeps: 'mantiene la ventaja', summary: 'Lo más importante',
  },
  en: {
    blunder: 'Blunder', mistake: 'Mistake', dubious: 'Inaccuracy', brilliant: 'Brilliant move', good: 'Very good move',
    better: 'Better was', accuracy: 'Accuracy', white: 'White', black: 'Black', opening: 'Opening',
    and: 'and', lost: 'gives away much of the advantage', losing: 'leaves a lost game', equal: 'lets the advantage slip',
    keeps: 'keeps the advantage', summary: 'What mattered',
  },
  de: {
    blunder: 'Grober Fehler', mistake: 'Fehler', dubious: 'Ungenauigkeit', brilliant: 'Glänzender Zug', good: 'Sehr guter Zug',
    better: 'Besser war', accuracy: 'Genauigkeit', white: 'Weiß', black: 'Schwarz', opening: 'Eröffnung',
    and: 'und', lost: 'gibt einen großen Teil des Vorteils ab', losing: 'führt zu einer verlorenen Stellung', equal: 'verschenkt den Vorteil',
    keeps: 'hält den Vorteil fest', summary: 'Das Wichtigste',
  },
};

const piece = (lang: Lang, p: string | number | undefined) => `${THE[lang][String(p)]} ${PIECE[lang][String(p)]}`;
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const list = (items: string[], lang: Lang) =>
  items.length <= 1 ? items.join('') : `${items.slice(0, -1).join(', ')} ${TEXT[lang].and} ${items[items.length - 1]}`;

/** One motif in words. Squares are written plainly ("d8"), never as moves. */
/** "Checkmate. The king has no escape: f8 and h8 are covered by …; f7 … are taken by its own pieces." */
function mateText(chess: Chess, lang: Lang, who: (s: string) => string): string {
  const head = lang === 'es' ? 'Jaque mate.' : lang === 'en' ? 'Checkmate.' : 'Schachmatt.';
  const mated = chess.turn();
  const king = findKing(chess, mated);
  const bare = new Chess(chess.fen());
  bare.remove(king as Square);
  const covered = new Map<string, string[]>();
  const own: string[] = [];
  for (let df = -1; df <= 1; df++) for (let dr = -1; dr <= 1; dr++) {
    if (!df && !dr) continue;
    const f = king.charCodeAt(0) - 97 + df, r = Number(king[1]) + dr;
    if (f < 0 || f > 7 || r < 1 || r > 8) continue;
    const s = `${'abcdefgh'[f]}${r}`;
    const p = chess.get(s as Square);
    if (p && p.color === mated) { own.push(s); continue; }
    const by = bare.attackers(s as Square, mated === 'w' ? 'b' : 'w').sort().join(',');
    if (by) covered.set(by, [...(covered.get(by) ?? []), s]);
  }
  const parts: string[] = [];
  for (const [by, sqs] of covered) {
    const pieces = list(by.split(',').map(who), lang);
    const many = sqs.length > 1;
    const several = by.includes(',');
    parts.push(lang === 'es' ? `${list(sqs.sort(), lang)} ${many ? 'las' : 'la'} ${several ? 'cubren' : 'cubre'} ${pieces}`
      : lang === 'en' ? `${list(sqs.sort(), lang)} ${many ? 'are' : 'is'} covered by ${pieces}`
      : `${list(sqs.sort(), lang)} ${several ? 'decken' : 'deckt'} ${pieces}`);
  }
  if (own.length) {
    const many = own.length > 1;
    parts.push(lang === 'es' ? `${list(own.sort(), lang)} ${many ? 'están ocupadas' : 'está ocupada'} por sus propias piezas`
      : lang === 'en' ? `${list(own.sort(), lang)} ${many ? 'are' : 'is'} taken by its own pieces`
      : `${list(own.sort(), lang)} ${many ? 'sind' : 'ist'} von eigenen Figuren besetzt`);
  }
  if (!parts.length) return head;
  const lead = lang === 'es' ? 'El rey no tiene escape' : lang === 'en' ? 'The king has no escape' : 'Der König hat kein Fluchtfeld';
  return `${head} ${lead}: ${parts.join('; ')}.`;
}

export function motifText(m: Motif, fenAfter: string, lang: Lang): string {
  const chess = new Chess(fenAfter);
  const who = (s: string) => {
    const p = chess.get(s as Square);
    return p ? `${piece(lang, p.type)} ${lang === 'es' ? 'de' : lang === 'en' ? 'on' : 'auf'} ${s}` : s;
  };
  // German objects take the accusative ("greift den Bauern auf e4 an").
  const ACC: Record<string, string> = { p: 'den Bauern', n: 'den Springer', b: 'den Läufer', r: 'den Turm', q: 'die Dame', k: 'den König' };
  const whom = (s: string) => {
    const p = chess.get(s as Square);
    return lang === 'de' && p ? `${ACC[p.type]} auf ${s}` : who(s);
  };
  const mover = chess.get(m.square as Square);
  const me = mover ? cap(piece(lang, mover.type)) : '';
  switch (m.kind) {
    case 'fork':
      return lang === 'es' ? `Ataque doble: ${me.toLowerCase()} ataca a la vez ${list(m.squares.map(who), lang)}.`
        : lang === 'en' ? `Double attack: ${me.toLowerCase()} attacks ${list(m.squares.map(who), lang)} at once.`
        : `Doppelangriff: ${me} greift zugleich ${list(m.squares.map(whom), lang)} an.`;
    case 'pin':
      return lang === 'es' ? `Clavada: ${who(m.squares[0])} no puede moverse sin exponer ${who(m.squares[1])}.`
        : lang === 'en' ? `Pin: ${who(m.squares[0])} cannot move without exposing ${who(m.squares[1])}.`
        : `Fesselung: ${who(m.squares[0])} kann nicht ziehen, ohne ${whom(m.squares[1])} preiszugeben.`;
    case 'skewer':
      return lang === 'es' ? `Enfilada: ${who(m.squares[0])} debe apartarse y queda expuesto ${who(m.squares[1])}.`
        : lang === 'en' ? `Skewer: ${who(m.squares[0])} has to step aside, exposing ${who(m.squares[1])}.`
        : `Spieß: ${who(m.squares[0])} muss ausweichen und gibt ${whom(m.squares[1])} preis.`;
    case 'sacrifice':
      return lang === 'es' ? `Sacrificio: ${me.toLowerCase()} se entrega en ${m.square}.`
        : lang === 'en' ? `Sacrifice: ${me.toLowerCase()} is given up on ${m.square}.`
        : `Opfer: ${me} wird auf ${m.square} hergegeben.`;
    case 'exchange-sacrifice':
      return lang === 'es' ? `Sacrificio de calidad: la torre se entrega por una pieza menor en ${m.square}.`
        : lang === 'en' ? `Exchange sacrifice: the rook is given up for a minor piece on ${m.square}.`
        : `Qualitätsopfer: der Turm wird auf ${m.square} für eine Leichtfigur gegeben.`;
    case 'discovered-check':
      return lang === 'es' ? `Jaque a la descubierta: al apartarse la pieza, da jaque ${who(m.squares[0])}.`
        : lang === 'en' ? `Discovered check: the piece steps away and ${who(m.squares[0])} gives check.`
        : `Abzugsschach: die Figur zieht weg und ${who(m.squares[0])} gibt Schach.`;
    case 'double-check':
      return lang === 'es' ? 'Jaque doble: el rey está obligado a moverse.' : lang === 'en' ? 'Double check: the king has to move.' : 'Doppelschach: der König muss ziehen.';
    case 'joint-attack': {
      const [target, ...attackers] = m.squares;
      if (m.data?.prior) {
        const prior = String(m.data.prior).split(',').map(who);
        return lang === 'es' ? `${me} se suma al ataque ${prior.length > 1 ? 'de ' : ''}${list(prior, lang).replace(/^el /, 'del ')} sobre ${who(target)}.`
          : lang === 'en' ? `${me} joins the attack of ${list(prior, lang)} on ${who(target)}.`
          : `${me} verstärkt den Angriff ${list(prior, lang).replace(/^der (\S+)/, (_x, n: string) => `des ${n === 'Bauer' ? 'Bauern' : n === 'König' ? 'Königs' : n === 'Turm' ? 'Turms' : n + 's'}`)} auf ${whom(target)}.`;
      }
      return lang === 'es' ? `${cap(list(attackers.map(who), lang))} atacan juntos ${who(target)}.`
        : lang === 'en' ? `${cap(list(attackers.map(who), lang))} attack ${who(target)} together.`
        : `${cap(list(attackers.map(who), lang))} greifen gemeinsam ${whom(target)} an.`;
    }
    case 'mate-threat':
      return lang === 'es' ? `Amenaza mate en ${m.data?.n}.` : lang === 'en' ? `Threatens mate in ${m.data?.n}.` : `Droht Matt in ${m.data?.n}.`;
    case 'late-value':
      return lang === 'es' ? `Parece una jugada modesta, pero ${piece(lang, m.data?.piece)} colocado aquí será decisivo en la jugada ${m.data?.move}.`
        : lang === 'en' ? `It looks modest, but ${piece(lang, m.data?.piece)} placed here will be decisive on move ${m.data?.move}.`
        : `Sieht bescheiden aus, aber ${piece(lang, m.data?.piece)} auf diesem Feld entscheidet im ${m.data?.move}. Zug.`;
    case 'threat': {
      const sq = m.squares[0];
      if (m.data?.type === 'mate') return lang === 'es' ? `Amenaza mate en ${sq}.` : lang === 'en' ? `Threatens mate on ${sq}.` : `Droht Matt auf ${sq}.`;
      if (m.data?.type === 'discovered') {
        return lang === 'es' ? `Amenaza un jaque a la descubierta moviendo ${who(sq)}.`
          : lang === 'en' ? `Threatens a discovered check by moving ${who(sq)}.`
          : `Droht ein Abzugsschach durch den Zug von ${who(sq)}.`;
      }
      if (m.data?.type === 'fork') {
        return lang === 'es' ? `Amenaza un ataque doble desde ${sq}.` : lang === 'en' ? `Threatens a fork from ${sq}.` : `Droht eine Gabel von ${sq} aus.`;
      }
      return lang === 'es' ? `Amenaza capturar ${who(sq)}.` : lang === 'en' ? `Threatens to take ${who(sq)}.` : `Droht, ${who(sq)} zu schlagen.`;
    }
    case 'attack-undefended':
      return lang === 'es' ? `${me} ataca ${list(m.squares.map(who), lang)}, que nadie defiende.`
        : lang === 'en' ? `${me} attacks ${list(m.squares.map(who), lang)}, which nothing defends.`
        : `${me} greift ${list(m.squares.map(whom), lang)} an, ungedeckt.`;
    case 'wins-material':
      return lang === 'es' ? `Gana ${PIECE.es[String(m.data?.piece)] === 'peón' ? 'un peón' : 'material'}.`
        : lang === 'en' ? `Wins ${m.data?.piece === 'p' ? 'a pawn' : 'material'}.`
        : `Gewinnt ${m.data?.piece === 'p' ? 'einen Bauern' : 'Material'}.`;
    case 'discovered-attack':
      return lang === 'es' ? `Ataque a la descubierta: al apartarse la pieza, ${who(m.squares[0])} ataca ${who(m.squares[1])}.`
        : lang === 'en' ? `Discovered attack: the piece steps away and ${who(m.squares[0])} attacks ${who(m.squares[1])}.`
        : `Abzugsangriff: die Figur zieht weg und ${who(m.squares[0])} greift ${who(m.squares[1])} an.`;
    case 'outpost':
      return lang === 'es' ? `${me} ocupa una casilla fuerte en ${m.square}: ningún peón rival puede expulsarlo.`
        : lang === 'en' ? `${me} takes an outpost on ${m.square}: no enemy pawn can drive it away.`
        : `${me} besetzt einen Vorposten auf ${m.square}: kein gegnerischer Bauer kann ihn vertreiben.`;
    case 'open-file':
      return lang === 'es' ? `La columna ${m.data?.file} queda abierta para las torres.`
        : lang === 'en' ? `The ${m.data?.file}-file is open for the rooks.`
        : `Die ${m.data?.file}-Linie ist für die Türme offen.`;
    case 'passed-pawn':
      return lang === 'es' ? `El peón de ${m.square} es un peón pasado.` : lang === 'en' ? `The pawn on ${m.square} is a passed pawn.` : `Der Bauer auf ${m.square} ist ein Freibauer.`;
    case 'battery': {
      // squares: [partner, target, ...the whole line]
      const [partner, aim, ...line] = m.squares;
      const where = lineName(line, lang);
      const pair = lang === 'es' ? `${me} y ${who(partner)}` : lang === 'en' ? `${me} and ${who(partner)}` : `${me} und ${who(partner)}`;
      if (!where) return lang === 'es' ? `${pair} se alinean.` : lang === 'en' ? `${pair} line up.` : `${pair} stehen auf einer Linie.`;
      if (!aim) return lang === 'es' ? `${pair} se doblan en ${where}, sin peones propios.`
        : lang === 'en' ? `${pair} double on ${where}, free of own pawns.`
        : `${pair} verdoppeln sich auf ${where}, ohne eigene Bauern.`;
      return lang === 'es' ? `${pair} se alinean en ${where} contra ${who(aim)}.`
        : lang === 'en' ? `${pair} line up on ${where} against ${who(aim)}.`
        : `${pair} stehen auf ${where} gegen ${who(aim)}.`;
    }
    case 'x-ray':
      return lang === 'es' ? `Rayos X: ${me.toLowerCase()} actúa a través de ${who(m.squares[0])} sobre ${who(m.squares[1])}.`
        : lang === 'en' ? `X-ray: ${me.toLowerCase()} acts through ${who(m.squares[0])} on ${who(m.squares[1])}.`
        : `Röntgenangriff: ${me} wirkt durch ${who(m.squares[0])} hindurch auf ${whom(m.squares[1])}.`;
    case 'leaves-hanging':
      return lang === 'es' ? `Deja sin defensa ${list(m.squares.map(who), lang)}.`
        : lang === 'en' ? `Leaves ${list(m.squares.map(who), lang)} undefended.`
        : `Lässt ${list(m.squares.map(whom), lang)} ungedeckt.`;
    case 'pawn-sacrifice':
      return lang === 'es' ? `Sacrificio de peón en ${m.square}.` : lang === 'en' ? `A pawn sacrifice on ${m.square}.` : `Bauernopfer auf ${m.square}.`;
    case 'aims-at': {
      const near = m.data?.near ? (lang === 'es' ? ', junto al rey' : lang === 'en' ? ', next to the king' : ', neben dem König') : '';
      const sq = m.squares[0];
      return lang === 'es' ? `${me} apunta a ${sq}${near}: allí se decide la partida en la jugada ${m.data?.move}.`
        : lang === 'en' ? `${me} aims at ${sq}${near}: that is where the game is decided, on move ${m.data?.move}.`
        : `${me} zielt auf ${sq}${near}: dort fällt im ${m.data?.move}. Zug die Entscheidung.`;
    }
    case 'overloaded': {
      const [def, ...held] = m.squares;
      const items = held.map(who);
      if (m.data?.side === 'foe') {
        return lang === 'es' ? `${cap(who(def))} queda sobrecargada: es la única defensa ${list(items.map((x) => `de ${x}`), lang).replace(/de el /g, 'del ')}.`
          : lang === 'en' ? `${cap(who(def))} is overloaded: it is the only defender of ${list(items, lang)}.`
          : `${cap(who(def))} ist überlastet: einziger Verteidiger von ${list(items, lang)}.`;
      }
      return lang === 'es' ? `Cuidado: ${who(def)} es la única defensa ${list(items.map((x) => `de ${x}`), lang).replace(/de el /g, 'del ')}; está sobrecargada.`
        : lang === 'en' ? `Careful: ${who(def)} is the only defender of ${list(items, lang)}; it is overloaded.`
        : `Vorsicht: ${who(def)} ist der einzige Verteidiger von ${list(items, lang)}; überlastet.`;
    }
    case 'traps':
      return lang === 'es' ? `${cap(who(m.squares[0]))} queda atrapado: no tiene ninguna casilla segura.`
        : lang === 'en' ? `${cap(who(m.squares[0]))} is trapped: it has no safe square.`
        : `${cap(who(m.squares[0]))} ist gefangen: kein sicheres Feld.`;
    case 'key-square': {
      const name = OPENINGS.find((o) => o[1] === m.data?.opening || o[1].startsWith(`${m.data?.opening},`) || o[1].startsWith(`${m.data?.opening}:`));
      const local = name ? (lang === 'en' ? name[1] : lang === 'es' ? name[2] : name[3]).split(/[:,]/)[0].trim() : String(m.data?.opening);
      return lang === 'es' ? `Lucha por ${m.squares[0]}, casilla clave en la ${local}.`
        : lang === 'en' ? `Fights for ${m.squares[0]}, a key square in the ${local}.`
        : `Kämpft um ${m.squares[0]}, ein Schlüsselfeld in der ${local}.`;
    }
    case 'positional-sacrifice': {
      const pawn = m.data?.amount === 1;
      return lang === 'es' ? `Sacrificio posicional: entrega ${pawn ? 'un peón' : 'material'} a cambio de juego (no lo recupera en las jugadas siguientes).`
        : lang === 'en' ? `A positional sacrifice: it gives ${pawn ? 'a pawn' : 'material'} for play (not won back in the next moves).`
        : `Positionelles Opfer: gibt ${pawn ? 'einen Bauern' : 'Material'} für Spiel (in den nächsten Zügen nicht zurückgewonnen).`;
    }
    case 'combination':
      return m.data?.mate
        ? (lang === 'es' ? 'Empieza una combinación que lleva al mate.' : lang === 'en' ? 'Starts a combination that leads to mate.' : 'Leitet eine Kombination ein, die zum Matt führt.')
        : (lang === 'es' ? 'Empieza una combinación que gana material.' : lang === 'en' ? 'Starts a combination that wins material.' : 'Leitet eine Kombination ein, die Material gewinnt.');
    case 'prepares-castling':
      if (m.data?.move) {
        return lang === 'es' ? `Despeja el camino del enroque ${m.data.side === 'short' ? 'corto' : 'largo'}, que llega en la jugada ${m.data.move}.`
          : lang === 'en' ? `Clears the way to castle ${m.data.side === 'short' ? 'kingside' : 'queenside'}, which comes on move ${m.data.move}.`
          : `Macht den Weg für die ${m.data.side === 'short' ? 'kurze' : 'lange'} Rochade frei, die im ${m.data.move}. Zug folgt.`;
      }
      return lang === 'es' ? `Deja listo el enroque ${m.data?.side === 'short' ? 'corto' : 'largo'}.`
        : lang === 'en' ? `Clears the way to castle ${m.data?.side === 'short' ? 'kingside' : 'queenside'}.`
        : `Macht die ${m.data?.side === 'short' ? 'kurze' : 'lange'} Rochade möglich.`;
    case 'en-passant':
      return lang === 'es' ? 'Captura al paso.' : lang === 'en' ? 'En passant capture.' : 'Schlagen en passant.';
    case 'mate':
      return mateText(chess, lang, who);
    default:
      return '';
  }
}

const GLYPH: Record<MoveQuality, string> = { brilliant: '!!', good: '!', interesting: '!?', dubious: '?!', mistake: '?', blunder: '??' };

/** Moves of a line numbered from a given ply: "3... g6 4. Qf3 Nf6". */
export function numberLine(line: string[], moveNumber: number, color: 'white' | 'black'): string {
  let n = moveNumber;
  let white = color === 'white';
  return line.map((san, i) => {
    const prefix = white ? `${n}. ` : i === 0 ? `${n}... ` : '';
    if (!white) n++;
    white = !white;
    return prefix + san;
  }).join(' ');
}

export interface AnnotateOptions {
  /** 1: marks only · 2: + remarks and better lines at the turning points · 3: + tactics, opening, summary. */
  level: 1 | 2 | 3;
  lang: Lang;
  title?: string;
  white?: string | null;
  black?: string | null;
  /** Remarks written elsewhere (a language model), per ply (1-based): they replace the automatic wording of that move. */
  remarks?: Record<number, string>;
  /** An opening paragraph written elsewhere, added after the summary line. */
  intro?: string;
  /**
   * How remarks sit among the moves: 'inline' { in braces } (default),
   * 'split' (the line of moves breaks after a commented move, the remark is its
   * own paragraph), 'paragraphs' (runs of moves, each followed by one paragraph
   * with the remarks of those moves) — the last two as chess books print them.
   */
  layout?: 'inline' | 'split' | 'paragraphs';
  /** Diagram marks (`[Diagram fen="…" eval="…"]`, one line each): after the key moments, after chosen moves (node ids), with the evaluation. */
  diagrams?: { key?: boolean; at?: string[]; eval?: boolean };
}

/** "Evaluation: +1.2 (White is better)" / "White mates in 3", from White's point of view. */
export function evalText(score: Score, lang: Lang): string {
  if (score.mate !== undefined && score.mate !== 0) {
    const n = Math.abs(score.mate);
    const white = score.mate > 0;
    return lang === 'es' ? `Mate en ${n} para las ${white ? 'blancas' : 'negras'}`
      : lang === 'en' ? `${white ? 'White' : 'Black'} mates in ${n}`
      : `${white ? 'Weiß' : 'Schwarz'} setzt in ${n} matt`;
  }
  const cp = score.cp ?? 0;
  const value = `${cp >= 0 ? '+' : '−'}${(Math.abs(cp) / 100).toFixed(1)}`;
  const side = cp > 0 ? 0 : 1;
  const words = Math.abs(cp) < 50
    ? { es: 'igualdad', en: 'equal', de: 'ausgeglichen' }
    : Math.abs(cp) < 150
      ? { es: `algo mejor las ${['blancas', 'negras'][side]}`, en: `${['White', 'Black'][side]} is slightly better`, de: `${['Weiß', 'Schwarz'][side]} steht etwas besser` }
      : { es: `ventaja de las ${['blancas', 'negras'][side]}`, en: `${['White', 'Black'][side]} is clearly better`, de: `${['Weiß', 'Schwarz'][side]} steht klar besser` };
  return `${lang === 'es' ? 'Evaluación' : lang === 'en' ? 'Evaluation' : 'Bewertung'}: ${value} (${words[lang]})`;
}

/**
 * The game as an annotated text: moves with their marks, remarks in braces and
 * better lines in parentheses — the format the reader recognises, so it can be
 * read, narrated and lit up like a page of a book.
 */
export function annotateGame(plies: PlyInput[], review: GameReview, options: AnnotateOptions): string {
  const { level, lang } = options;
  const t = TEXT[lang];
  const lines: string[] = [];
  const players = options.white && options.black ? `${options.white} – ${options.black}` : '';
  lines.push(options.title ? (players && !options.title.includes(options.white!) ? `${options.title}. ${players}` : options.title) : players || '—');

  const sans = plies.map((p) => stripMarks(p.san));
  const opening = openingName(sans, lang);
  const head: string[] = [];
  if (level >= 3 && opening) head.push(`${t.opening}: ${opening}.`);
  head.push(`${t.accuracy}: ${t.white} ${Math.round(review.white.accuracy)}%, ${t.black} ${Math.round(review.black.accuracy)}%.`);
  if (level >= 3) {
    const notable: string[] = [];
    for (const m of review.moves) {
      const who = m.color === 'white' ? t.white : t.black;
      const at = `${m.moveNumber}${m.color === 'white' ? '' : '…'}`;
      if (m.motifs.some((x) => x.kind === 'exchange-sacrifice') && m.quality !== 'blunder' && m.quality !== 'mistake') {
        notable.push(lang === 'es' ? `sacrificio de calidad de las ${who.toLowerCase()} en la jugada ${at}` : lang === 'en' ? `${who}'s exchange sacrifice on move ${at}` : `Qualitätsopfer von ${who} im ${at}. Zug`);
      } else if (m.quality === 'brilliant') {
        notable.push(lang === 'es' ? `sacrificio de las ${who.toLowerCase()} en la jugada ${at}` : lang === 'en' ? `${who}'s sacrifice on move ${at}` : `Opfer von ${who} im ${at}. Zug`);
      } else if (m.quality === 'blunder') {
        notable.push(lang === 'es' ? `error grave de las ${who.toLowerCase()} en la jugada ${at}` : lang === 'en' ? `${who}'s blunder on move ${at}` : `grober Fehler von ${who} im ${at}. Zug`);
      }
    }
    if (notable.length) head.push(`${t.summary}: ${list(notable.slice(0, 6), lang)}.`);
  }
  lines.push(head.join(' '));
  if (options.intro) lines.push(options.intro);

  // Moves are written in the letters of the language (Spanish: R D T A C).
  const LETTERS: Record<string, Record<string, string>> = {
    es: { K: 'R', Q: 'D', R: 'T', B: 'A', N: 'C' },
    de: { K: 'K', Q: 'D', R: 'T', B: 'L', N: 'S' },
  };
  const map = LETTERS[lang];
  const local = (san: string) =>
    map ? san.replace(/^[KQRBN]/, (c) => map[c]).replace(/=([QRBN])/, (_m, c: string) => `=${map[c]}`) : san;
  const layout = options.layout ?? 'inline';
  const keyMoment = (i: number) => {
    const q = review.moves[i].quality;
    return q === 'blunder' || q === 'mistake' || q === 'brilliant' || q === 'good' || plies[i].san.includes('#');
  };
  const side = (c: 'white' | 'black') => (lang === 'es' ? (c === 'white' ? 'blancas' : 'negras') : lang === 'en' ? (c === 'white' ? 'White' : 'Black') : (c === 'white' ? 'Weiß' : 'Schwarz'));

  const out: string[] = []; // lines (split/paragraphs) or chunks (inline)
  let line: string[] = [];
  let pending: string[] = []; // 'paragraphs': remarks waiting for the end of the run
  let needNumber = true;
  const flush = () => {
    if (line.length) out.push(line.join(' '));
    line = [];
    if (pending.length) out.push(pending.join(' '));
    pending = [];
  };
  plies.forEach((p, i) => {
    const m = review.moves[i];
    const white = p.color === 'white';
    const glyph = m.quality ? GLYPH[m.quality] : '';
    const number = white ? `${p.moveNumber}. ` : needNumber ? `${p.moveNumber}... ` : '';
    const move = `${number}${local(p.san.replace(/[!?]+$/, ''))}${glyph}`;
    needNumber = false;

    const remarks: string[] = [];
    const given = options.remarks?.[i + 1];
    if (given) remarks.push(given);
    if (!given && level >= 2 && m.quality) {
      const label = t[m.quality === 'interesting' ? 'good' : m.quality];
      if (m.quality === 'blunder' || m.quality === 'mistake' || m.quality === 'dubious') {
        const effect = m.winAfter < 25 ? t.losing : m.winBefore > 60 && m.winAfter <= 60 ? t.equal : t.lost;
        remarks.push(`${label}: ${effect}.`);
      } else {
        remarks.push(`${label}.`);
      }
    }
    if (!given && level >= 3) {
      for (const motif of m.motifs) {
        const said = motifText(motif, p.fenAfter, lang);
        if (said) remarks.push(said);
      }
    }
    const better = level >= 2 && m.best && (m.quality === 'blunder' || m.quality === 'mistake' || m.quality === 'dubious');
    if (better && !given?.includes(t.better)) remarks.push(`${t.better}:`);
    const variation = better
      ? `(${numberLine(m.best!.line.slice(0, 6).length ? m.best!.line.slice(0, 6) : [m.best!.san], p.moveNumber, p.color).split(' ').map(local).join(' ')})`
      : '';
    // What the better move does (its own ideas on the board).
    let betterIdea = '';
    if (variation && level >= 3) {
      const ideas = moveMotifs(p.fenBefore, m.best!.san).filter((x) => x.kind !== 'capture' && x.kind !== 'check');
      if (ideas.length) {
        const c = new Chess(p.fenBefore);
        try {
          c.move(stripMarks(m.best!.san));
          betterIdea = ideas.slice(0, 2).map((x) => motifText(x, c.fen(), lang)).filter(Boolean).join(' ');
        } catch { /* not a legal move here */ }
      }
    }
    const d = options.diagrams;
    const diagram = d && ((d.key && keyMoment(i)) || d.at?.includes(p.nodeId))
      ? `[Diagram fen="${p.fenAfter}"${d.eval ? ` eval="${evalText(p.after, lang)}"` : ''}]`
      : '';

    if (layout === 'inline') {
      let chunk = move;
      if (remarks.length) chunk += ` { ${remarks.join(' ')} }`;
      if (variation) chunk += ` ${variation}`;
      if (betterIdea) chunk += ` { ${betterIdea} }`;
      if (remarks.length || variation) needNumber = true;
      out.push(chunk);
      if (diagram) { out.push(`\n${diagram}\n`); needNumber = true; }
      return;
    }
    line.push(move);
    if (layout === 'split') {
      if (remarks.length || variation || diagram) {
        flush();
        if (remarks.length) out.push(remarks.join(' '));
        if (variation) out.push(variation);
        if (betterIdea) out.push(betterIdea);
        if (diagram) out.push(diagram);
        needNumber = true;
      }
      return;
    }
    // 'paragraphs': remarks wait for the end of the run; a variation or a
    // diagram ends the run (a variation must follow the move it replaces).
    if (remarks.length) pending.push(`${lang === 'es' ? 'Jugada' : lang === 'en' ? 'Move' : 'Zug'} ${p.moveNumber} (${side(p.color)}): ${remarks.join(' ')}`);
    if (variation || diagram || line.length >= 10) {
      flush();
      if (variation) out.push(variation);
      if (betterIdea) out.push(betterIdea);
      if (diagram) out.push(diagram);
      needNumber = true;
    }
  });
  if (layout === 'inline') {
    lines.push(out.join(' ').replace(/ ?\n /g, '\n').replace(/\n /g, '\n'));
  } else {
    flush();
    lines.push(...out);
  }
  return lines.join('\n');
}

// ── openings ────────────────────────────────────────────────────────────────

const OPENINGS: Array<[string, string, string, string]> = [
  ['e4 e5 Nf3 Nc6 Bb5', 'Ruy Lopez', 'Apertura Española', 'Spanische Partie'],
  ['e4 e5 Nf3 Nc6 Bc4 Bc5', 'Italian Game, Giuoco Piano', 'Apertura Italiana, Giuoco Piano', 'Italienische Partie, Giuoco Piano'],
  ['e4 e5 Nf3 Nc6 Bc4 Nf6', 'Two Knights Defence', 'Defensa de los Dos Caballos', 'Zweispringerspiel'],
  ['e4 e5 Nf3 Nc6 Bc4', 'Italian Game', 'Apertura Italiana', 'Italienische Partie'],
  ['e4 e5 Nf3 Nc6 d4', 'Scotch Game', 'Apertura Escocesa', 'Schottische Partie'],
  ['e4 e5 Nf3 Nc6 Nc3 Nf6', 'Four Knights Game', 'Apertura de los Cuatro Caballos', 'Vierspringerspiel'],
  ['e4 e5 Nf3 Nf6', 'Petrov Defence', 'Defensa Petrov', 'Russische Verteidigung'],
  ['e4 e5 Nf3 d6', 'Philidor Defence', 'Defensa Philidor', 'Philidor-Verteidigung'],
  ['e4 e5 f4 exf4 Bc4', "King's Gambit Accepted, Bishop's Gambit", 'Gambito de Rey Aceptado, Gambito de Alfil', 'Angenommenes Königsgambit, Läufergambit'],
  ['e4 e5 f4 exf4', "King's Gambit Accepted", 'Gambito de Rey Aceptado', 'Angenommenes Königsgambit'],
  ['e4 e5 f4', "King's Gambit", 'Gambito de Rey', 'Königsgambit'],
  ['e4 e5 Nc3', 'Vienna Game', 'Apertura Vienesa', 'Wiener Partie'],
  ['e4 e5 Bc4', "Bishop's Opening", 'Apertura de Alfil', 'Läuferspiel'],
  ['e4 e5 d4 exd4 c3', 'Danish Gambit', 'Gambito Danés', 'Dänisches Gambit'],
  ['e4 e5 d4', 'Centre Game', 'Apertura del Centro', 'Mittelgambit'],
  ['e4 e5', "King's Pawn Game", 'Apertura Abierta', 'Offenes Spiel'],
  ['e4 c5 Nf3 d6 d4 cxd4 Nxd4 Nf6 Nc3 a6', 'Sicilian Defence, Najdorf Variation', 'Defensa Siciliana, Variante Najdorf', 'Sizilianische Verteidigung, Najdorf-Variante'],
  ['e4 c5 Nf3 d6 d4 cxd4 Nxd4 Nf6 Nc3 g6', 'Sicilian Defence, Dragon Variation', 'Defensa Siciliana, Variante del Dragón', 'Sizilianische Verteidigung, Drachenvariante'],
  ['e4 c5', 'Sicilian Defence', 'Defensa Siciliana', 'Sizilianische Verteidigung'],
  ['e4 e6 d4 d5', 'French Defence', 'Defensa Francesa', 'Französische Verteidigung'],
  ['e4 e6', 'French Defence', 'Defensa Francesa', 'Französische Verteidigung'],
  ['e4 c6', 'Caro-Kann Defence', 'Defensa Caro-Kann', 'Caro-Kann-Verteidigung'],
  ['e4 d5', 'Scandinavian Defence', 'Defensa Escandinava', 'Skandinavische Verteidigung'],
  ['e4 Nf6', 'Alekhine Defence', 'Defensa Alekhine', 'Aljechin-Verteidigung'],
  ['e4 d6', 'Pirc Defence', 'Defensa Pirc', 'Pirc-Verteidigung'],
  ['e4 g6', 'Modern Defence', 'Defensa Moderna', 'Moderne Verteidigung'],
  ['d4 d5 c4 dxc4', "Queen's Gambit Accepted", 'Gambito de Dama Aceptado', 'Angenommenes Damengambit'],
  ['d4 d5 c4 e6', "Queen's Gambit Declined", 'Gambito de Dama Rehusado', 'Abgelehntes Damengambit'],
  ['d4 d5 c4 c6', 'Slav Defence', 'Defensa Eslava', 'Slawische Verteidigung'],
  ['d4 d5 c4', "Queen's Gambit", 'Gambito de Dama', 'Damengambit'],
  ['d4 d5 Bf4', 'London System', 'Sistema Londres', 'Londoner System'],
  ['d4 Nf6 c4 e6 Nc3 Bb4', 'Nimzo-Indian Defence', 'Defensa Nimzoindia', 'Nimzoindische Verteidigung'],
  ['d4 Nf6 c4 e6 Nf3 b6', "Queen's Indian Defence", 'Defensa India de Dama', 'Damenindische Verteidigung'],
  ['d4 Nf6 c4 g6 Nc3 d5', 'Grünfeld Defence', 'Defensa Grünfeld', 'Grünfeld-Indische Verteidigung'],
  ['d4 Nf6 c4 g6', "King's Indian Defence", 'Defensa India de Rey', 'Königsindische Verteidigung'],
  ['d4 Nf6 c4 c5', 'Benoni Defence', 'Defensa Benoni', 'Benoni-Verteidigung'],
  ['d4 Nf6 c4 e6', 'Indian Defence', 'Defensa India', 'Indische Verteidigung'],
  ['d4 Nf6', 'Indian Defence', 'Defensa India', 'Indische Verteidigung'],
  ['d4 f5', 'Dutch Defence', 'Defensa Holandesa', 'Holländische Verteidigung'],
  ['d4 d5', "Queen's Pawn Game", 'Apertura de Peón de Dama', 'Damenbauernspiel'],
  ['c4', 'English Opening', 'Apertura Inglesa', 'Englische Eröffnung'],
  ['Nf3', 'Réti Opening', 'Apertura Réti', 'Réti-Eröffnung'],
  ['f4', "Bird's Opening", 'Apertura Bird', 'Bird-Eröffnung'],
  ['b3', 'Nimzowitsch-Larsen Attack', 'Ataque Nimzowitsch-Larsen', 'Nimzowitsch-Larsen-Angriff'],
];

/** Name of the opening the moves belong to (longest known line), or null. */
export function openingName(sans: string[], lang: Lang): string | null {
  const played = sans.map(stripMarks).join(' ') + ' ';
  let best: [string, string, string, string] | null = null;
  for (const entry of OPENINGS) {
    if (played.startsWith(entry[0] + ' ') && (!best || entry[0].length > best[0].length)) best = entry;
  }
  return best ? best[lang === 'en' ? 1 : lang === 'es' ? 2 : 3] : null;
}

// ── players ─────────────────────────────────────────────────────────────────

export interface Players { white: string | null; black: string | null }

/**
 * Who played the game. Recognised, in this order: PGN tags (`[White "…"]`),
 * labelled lines ("Blancas: … / Negras: …", "White: …", "Weiß: …"), or a
 * heading before the first move written "White – Black" (also "vs").
 */
export function extractPlayers(text: string): Players {
  const tag = (name: string) => new RegExp(`\\[${name} "([^"]+)"\\]`).exec(text)?.[1] ?? null;
  const clean = (s: string | null | undefined) => {
    const v = (s ?? '').trim().replace(/[.;]+$/, '');
    return v && v !== '?' ? v : null;
  };
  if (tag('White') || tag('Black')) return { white: clean(tag('White')), black: clean(tag('Black')) };
  const label = (re: string) => new RegExp(`^\\s*(?:${re})\\s*:\\s*(.+)$`, 'mi').exec(text)?.[1];
  const w = label('Blancas|White|Wei(?:ß|ss)');
  const b = label('Negras|Black|Schwarz');
  if (w || b) return { white: clean(w), black: clean(b) };
  const firstMove = text.search(/(?:^|\s)1\.\s*[a-hNBRQKO♔-♟]/);
  const heading = (firstMove >= 0 ? text.slice(0, firstMove) : text.slice(0, 300)).split('\n').filter((l) => l.trim());
  const NAME = "[A-ZÁÉÍÓÚÑÄÖÜ][\\p{L}.'’-]*(?: +[A-ZÁÉÍÓÚÑÄÖÜ][\\p{L}.'’-]*){0,3}";
  for (const line of heading.reverse()) {
    const m = new RegExp(`(${NAME})\\s+(?:[–—-]|vs\\.?|contra)\\s+(${NAME})`, 'u').exec(line);
    if (m) return { white: clean(m[1]), black: clean(m[2]) };
  }
  return { white: null, black: null };
}
