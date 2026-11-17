import { Chess, type Color as ChessColor, type PieceSymbol, type Square } from 'chess.js';
import type { GameReview, Motif, PlyInput } from './gameReview.js';
import { attacksFrom } from './commentCues.js';

/**
 * Does each remark make sense on the board it speaks about? Every idea the
 * commentary names is checked against the position after the move AND against
 * what happened next in the game (the game is the ground truth): "wins
 * material" must show in the material count, a pin needs a pinner that stays
 * on the board, "the file is open for the rooks" needs a rook… A finding is a
 * remark that would read as wrong to a player looking at the board.
 */
export interface AuditFinding {
  ply: number;
  san: string;
  kind: Motif['kind'];
  reason: string;
}

const VALUE: Record<PieceSymbol, number> = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 100 };

function balance(fen: string, color: ChessColor): number {
  let s = 0;
  for (const row of new Chess(fen).board()) for (const p of row) if (p && p.type !== 'k') s += (p.color === color ? 1 : -1) * VALUE[p.type];
  return s;
}

/** The piece on `square` can be taken for nothing, or by something cheaper. */
function lost(chess: Chess, square: string): boolean {
  const p = chess.get(square as Square);
  if (!p || p.type === 'k') return false;
  const foe: ChessColor = p.color === 'w' ? 'b' : 'w';
  const takers = chess.attackers(square as Square, foe);
  if (!takers.length) return false;
  if (!chess.attackers(square as Square, p.color).length) return true;
  return Math.min(...takers.map((s) => VALUE[chess.get(s)!.type])) < VALUE[p.type];
}

/** Kinds whose sentence says the moved piece acts from its square. */
const ACTS = new Set<Motif['kind']>(['pin', 'skewer', 'x-ray', 'battery', 'attack-undefended', 'joint-attack', 'fork']);

export function auditMotif(m: Motif, plies: PlyInput[], i: number): string | null {
  const p = plies[i];
  const chess = new Chess(p.fenAfter);
  const me: ChessColor = p.color === 'white' ? 'w' : 'b';
  const foe: ChessColor = me === 'w' ? 'b' : 'w';
  const at = (s: string) => chess.get(s as Square);
  const fenAt = (k: number) => plies[Math.min(plies.length - 1, k)].fenAfter;

  if (ACTS.has(m.kind) && m.kind !== 'battery' && m.kind !== 'joint-attack' && lost(chess, m.square) && !chess.isCheck()) {
    return `the ${at(m.square)?.type ?? 'piece'} on ${m.square} is simply lost next move`;
  }
  switch (m.kind) {
    case 'wins-material': {
      const start = balance(p.fenBefore, me);
      const later = Math.max(balance(fenAt(i + 1), me), balance(fenAt(i + 3), me));
      return later - start >= 1 ? null : `material is even after the reply (${later - start >= 0 ? '+' : ''}${later - start})`;
    }
    case 'open-file': {
      const rooks = chess.board().some((row) => row.some((q) => q?.color === me && q.type === 'r'));
      if (!rooks) return 'the side has no rook';
      const file = String(m.data?.file ?? '');
      for (let r = 1; r <= 8; r++) {
        const q = at(`${file}${r}`);
        if (q?.type === 'p' && q.color === me) return `own pawn on ${file}${r}`;
      }
      return null;
    }
    case 'pin':
    case 'skewer': {
      const [front, behind] = m.squares.map(at);
      const pinner = at(m.square);
      if (!pinner || !'bqr'.includes(pinner.type)) return 'no long-range piece pins';
      if (!front || !behind || front.color !== foe || behind.color !== foe) return 'the pinned pieces are not there';
      return attacksFrom(chess, m.square).includes(m.squares[0]) ? null : 'the pinner does not reach the pinned piece';
    }
    case 'fork': {
      const hit = m.squares.filter((s) => at(s)?.color === foe && attacksFrom(chess, m.square).includes(s));
      return hit.length >= 2 ? null : 'it does not attack two pieces';
    }
    case 'battery': {
      const partner = at(m.squares[0]);
      if (!partner || partner.color !== me) return 'no partner on the line';
      if (lost(chess, m.square) && lost(chess, m.squares[0])) return 'both pieces are en prise';
      return null;
    }
    case 'attack-undefended':
      return m.squares.every((s) => at(s)?.color === foe && chess.attackers(s as Square, foe).length === 0) ? null : 'the target is defended';
    case 'mate':
      return chess.isCheckmate() ? null : 'no mate on the board';
    case 'prepares-castling': {
      if (!m.data?.move) return null;
      const castles = plies.slice(i + 1).some((q) => q.color === p.color && q.san.startsWith('O-O'));
      return castles ? null : 'the castling never comes';
    }
    case 'traps': {
      const sq = m.squares[0];
      // Escaped: the piece moves off and is not taken on its new square right after.
      for (let k = i + 1; k < Math.min(plies.length, i + 7); k++) {
        if (plies[k].to === sq) return null; // taken (or the square changed hands)
        if (plies[k].from === sq) {
          const next = plies[k + 1];
          return next && next.to === plies[k].to ? null : 'the piece escapes';
        }
      }
      return null;
    }
    case 'overloaded': {
      const [def, ...held] = m.squares;
      // The overloaded piece may be the mover's or the opponent's.
      const side: ChessColor = m.data?.side === 'foe' ? foe : me;
      const other: ChessColor = side === 'w' ? 'b' : 'w';
      const ok = held.filter((s) => {
        const d = chess.attackers(s as Square, side);
        return chess.attackers(s as Square, other).length > 0 && d.length === 1 && d[0] === def;
      });
      return ok.length >= 2 ? null : 'it is not the only defender of two attacked pieces';
    }
    case 'combination': {
      if (m.data?.mate) return plies.slice(i, i + 8).some((q) => q.san.includes('#')) ? null : 'no mate follows';
      const gain = balance(fenAt(i + 6), me) - balance(p.fenBefore, me);
      return gain >= 2 ? null : 'no material comes in';
    }
    case 'leaves-hanging':
      return m.squares.some((s) => at(s)?.color === me && lost(chess, s)) ? null : 'nothing is left hanging';
    default:
      return null;
  }
}

/** Every remark of a reviewed game that fails its check. */
export function auditGame(plies: PlyInput[], review: GameReview): AuditFinding[] {
  const out: AuditFinding[] = [];
  review.moves.forEach((mv, i) => {
    for (const m of mv.motifs) {
      const reason = auditMotif(m, plies, i);
      if (reason) out.push({ ply: i, san: plies[i].san, kind: m.kind, reason });
    }
  });
  return out;
}
