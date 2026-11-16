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
  | 'passed-pawn' | 'battery' | 'x-ray' | 'leaves-hanging';

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

/** Tactical motifs the move creates, read from the board alone. */
export function moveMotifs(fenBefore: string, san: string): Motif[] {
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

  // Sacrifice: the piece can be taken and is worth clearly more than what it took.
  const moved = at(m.to);
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

  // Fork: the moved piece attacks two or more pieces worth taking.
  if (moved) {
    const targets = reach.filter((s) => {
      const p = at(s);
      if (!p || p.color !== foe) return false;
      if (p.type === 'k') return true;
      return VALUE[p.type] > VALUE[moved.type] || chess.attackers(s as Square, foe).length === 0;
    });
    // …and is not simply taken itself (unless it gives check).
    const safe = chess.attackers(m.to as Square, foe).length === 0 || chess.isCheck();
    if (targets.length >= 2 && safe) add('fork', targets.sort(), { piece: moved.type });
  }

  // Pin / skewer along the lines of a bishop, rook or queen.
  if (moved && 'bqr'.includes(moved.type)) {
    const f0 = m.to.charCodeAt(0) - 97;
    const r0 = Number(m.to[1]) - 1;
    const dirs = moved.type === 'b' ? DIAG : moved.type === 'r' ? ORTH : [...DIAG, ...ORTH];
    for (const [df, dr] of dirs) {
      const seen: string[] = [];
      for (let f = f0 + df, r = r0 + dr; f >= 0 && f < 8 && r >= 0 && r < 8 && seen.length < 2; f += df, r += dr) {
        const s = `${'abcdefgh'[f]}${r + 1}`;
        if (at(s)) seen.push(s);
      }
      if (seen.length < 2) continue;
      const [front, behind] = seen.map((s) => at(s)!);
      // Battery: an own queen/rook/bishop that moves along this line stands right behind or in front.
      const along = (t: PieceSymbol) => t === 'q' || (df === 0 || dr === 0 ? t === 'r' : t === 'b');
      if (front.color === me && along(front.type) && !out.some((x) => x.kind === 'battery')) add('battery', [seen[0]], { piece: front.type });
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
    if (targets.length > 0 && safe) add('attack-undefended', targets.sort());
    // Material won on the spot: an undefended piece taken, or a more valuable one.
    if (m.captured && m.captured !== 'p' && (chess.attackers(m.to as Square, foe).length === 0 || VALUE[m.captured] > VALUE[moved.type])) {
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
  if (moved && !out.some((x) => x.kind === 'fork' || x.kind === 'mate')) {
    let bestSquare: string | null = null;
    let bestValue = 0;
    let bestAttackers: string[] = [];
    for (const s of reach) {
      const p = at(s);
      if (!p || p.color !== foe || p.type === 'k') continue;
      // A pawn only counts next to its king (f7, h2…): elsewhere it is routine.
      const king = findKing(chess, foe);
      if (p.type === 'p' && (Math.abs(s.charCodeAt(0) - king.charCodeAt(0)) > 1 || Math.abs(Number(s[1]) - Number(king[1])) > 1)) continue;
      const attackers = chess.attackers(s as Square, me);
      const defenders = chess.attackers(s as Square, foe);
      if (attackers.length >= 2 && attackers.length > defenders.filter((d) => at(d)!.type !== 'k').length && VALUE[p.type] >= bestValue) {
        bestSquare = s; bestValue = VALUE[p.type]; bestAttackers = attackers;
      }
    }
    if (bestSquare) add('joint-attack', [bestSquare, ...bestAttackers.sort()], { piece: at(bestSquare)!.type, count: bestAttackers.length });
  }
  return out;
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

export function reviewGame(plies: PlyInput[]): GameReview {
  const moves: ReviewedMove[] = plies.map((p, i) => {
    const white = p.color === 'white';
    const view = (s: Score) => (white ? winPercent(s) : 100 - winPercent(s));
    const winBefore = view(p.before);
    const winAfter = view(p.after);
    const loss = Math.max(0, winBefore - winAfter);
    const isBest = !!p.best && stripMarks(p.best.san) === stripMarks(p.san);
    const motifs = moveMotifs(p.fenBefore, p.san);
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

  const side = (color: 'white' | 'black'): PlayerReview => {
    const own = moves.filter((m) => m.color === color);
    const count = (q: MoveQuality) => own.filter((m) => m.quality === q).length;
    return {
      accuracy: own.length ? Math.round((own.reduce((a, m) => a + m.accuracy, 0) / own.length) * 10) / 10 : 0,
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
export function motifText(m: Motif, fenAfter: string, lang: Lang): string {
  const chess = new Chess(fenAfter);
  const who = (s: string) => {
    const p = chess.get(s as Square);
    return p ? `${piece(lang, p.type)} ${lang === 'es' ? 'de' : lang === 'en' ? 'on' : 'auf'} ${s}` : s;
  };
  const mover = chess.get(m.square as Square);
  const me = mover ? cap(piece(lang, mover.type)) : '';
  switch (m.kind) {
    case 'fork':
      return lang === 'es' ? `Ataque doble: ${me.toLowerCase()} ataca a la vez ${list(m.squares.map(who), lang)}.`
        : lang === 'en' ? `Double attack: ${me.toLowerCase()} attacks ${list(m.squares.map(who), lang)} at once.`
        : `Doppelangriff: ${me} greift zugleich ${list(m.squares.map(who), lang)} an.`;
    case 'pin':
      return lang === 'es' ? `Clavada: ${who(m.squares[0])} no puede moverse sin exponer ${who(m.squares[1])}.`
        : lang === 'en' ? `Pin: ${who(m.squares[0])} cannot move without exposing ${who(m.squares[1])}.`
        : `Fesselung: ${who(m.squares[0])} kann nicht ziehen, ohne ${who(m.squares[1])} preiszugeben.`;
    case 'skewer':
      return lang === 'es' ? `Enfilada: ${who(m.squares[0])} debe apartarse y queda expuesto ${who(m.squares[1])}.`
        : lang === 'en' ? `Skewer: ${who(m.squares[0])} has to step aside, exposing ${who(m.squares[1])}.`
        : `Spieß: ${who(m.squares[0])} muss ausweichen und gibt ${who(m.squares[1])} preis.`;
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
      return lang === 'es' ? `${cap(list(attackers.map(who), lang))} atacan juntos ${who(target)}.`
        : lang === 'en' ? `${cap(list(attackers.map(who), lang))} attack ${who(target)} together.`
        : `${cap(list(attackers.map(who), lang))} greifen gemeinsam ${who(target)} an.`;
    }
    case 'mate-threat':
      return lang === 'es' ? `Amenaza mate en ${m.data?.n}.` : lang === 'en' ? `Threatens mate in ${m.data?.n}.` : `Droht Matt in ${m.data?.n}.`;
    case 'late-value':
      return lang === 'es' ? `Parece una jugada modesta, pero ${piece(lang, m.data?.piece)} colocado aquí será decisivo en la jugada ${m.data?.move}.`
        : lang === 'en' ? `It looks modest, but ${piece(lang, m.data?.piece)} placed here will be decisive on move ${m.data?.move}.`
        : `Sieht bescheiden aus, aber ${piece(lang, m.data?.piece)} auf diesem Feld entscheidet im ${m.data?.move}. Zug.`;
    case 'en-passant':
      return lang === 'es' ? 'Captura al paso.' : lang === 'en' ? 'En passant capture.' : 'Schlagen en passant.';
    case 'mate':
      return lang === 'es' ? 'Jaque mate.' : lang === 'en' ? 'Checkmate.' : 'Schachmatt.';
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

  // Moves are written in the letters of the language (Spanish: R D T A C).
  const LETTERS: Record<string, string> = { K: 'R', Q: 'D', R: 'T', B: 'A', N: 'C' };
  const local = (san: string) =>
    lang === 'es' ? san.replace(/^[KQRBN]/, (c) => LETTERS[c]).replace(/=([QRBN])/, (_m, c: string) => `=${LETTERS[c]}`) : san;
  const body: string[] = [];
  let needNumber = true;
  plies.forEach((p, i) => {
    const m = review.moves[i];
    const white = p.color === 'white';
    const glyph = m.quality ? GLYPH[m.quality] : '';
    const number = white ? `${p.moveNumber}. ` : needNumber ? `${p.moveNumber}... ` : '';
    let chunk = `${number}${local(p.san.replace(/[!?]+$/, ''))}${glyph}`;
    needNumber = false;

    const remarks: string[] = [];
    if (level >= 2 && m.quality) {
      const label = t[m.quality === 'interesting' ? 'good' : m.quality];
      if (m.quality === 'blunder' || m.quality === 'mistake' || m.quality === 'dubious') {
        const effect = m.winAfter < 25 ? t.losing : m.winBefore > 60 && m.winAfter <= 60 ? t.equal : t.lost;
        remarks.push(`${label}: ${effect}.`);
      } else {
        remarks.push(`${label}.`);
      }
    }
    if (level >= 3) {
      for (const motif of m.motifs) {
        const said = motifText(motif, p.fenAfter, lang);
        if (said) remarks.push(said);
      }
    }
    const better = level >= 2 && m.best && (m.quality === 'blunder' || m.quality === 'mistake' || m.quality === 'dubious');
    if (better) remarks.push(`${t.better}:`);
    if (remarks.length) { chunk += ` { ${remarks.join(' ')} }`; needNumber = true; }
    if (better) {
      const line = m.best!.line.slice(0, 6);
      chunk += ` (${numberLine(line.length ? line : [m.best!.san], p.moveNumber, p.color).split(' ').map(local).join(' ')})`;
    }
    body.push(chunk);
  });
  lines.push(body.join(' '));
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
