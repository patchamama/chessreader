/**
 * Commentary by a language model.
 *
 * The model is not asked to play chess: it is handed the facts — every move
 * with the engine's verdict, the better line, the tactical ideas the detectors
 * found and who attacks and defends what — and asked to turn them into the
 * remarks a coach would make. The answer comes back as JSON keyed by ply, so
 * the remarks can be put on their moves by the same annotator that writes the
 * rule-based commentary.
 */

import type { Lang } from './concepts.js';
import { numberLine, type GameReview, type Motif, type PlyInput } from './gameReview.js';
import { positionIdeas } from './positionIdeas.js';
import { openingName } from './gameReview.js';

export interface CommentaryRequest {
  system: string;
  user: string;
}

export interface CommentaryOptions {
  lang: Lang;
  white?: string | null;
  black?: string | null;
}

const LANGUAGE: Record<Lang, string> = { es: 'Spanish', en: 'English', de: 'German' };
const NAME: Record<string, string> = { p: 'pawn', n: 'knight', b: 'bishop', r: 'rook', q: 'queen', k: 'king' };

/** One detected idea as a short fact ("fork: d8, a8"). */
function ideaFact(m: Motif): string | null {
  switch (m.kind) {
    case 'threat':
      return `threat: ${m.data?.type === 'mate' ? 'mate' : m.data?.type === 'fork' ? 'fork' : m.data?.type === 'discovered' ? 'discovered check by moving the piece' : `win the ${NAME[String(m.data?.piece)] ?? 'piece'}`} on ${m.squares[0]}`;
    case 'capture': case 'check': case 'castle': case 'promotion': case 'mate':
      return null; // already in the move itself
    case 'late-value':
      return `this piece decides the game on move ${m.data?.move}`;
    default:
      return `${m.kind.replace(/-/g, ' ')}${m.squares.length ? `: ${m.squares.join(', ')}` : ''}`;
  }
}

/** The request for a game: instructions, then the facts as JSON. */
export function buildCommentaryRequest(plies: PlyInput[], review: GameReview, options: CommentaryOptions): CommentaryRequest {
  const moves = plies.map((p, i) => {
    const m = review.moves[i];
    const ideas = positionIdeas(p.fenAfter);
    const piece = (x: { color: string; piece: string; square: string }) => `${x.color} ${NAME[x.piece]} ${x.square}`;
    const status = ideas.pieces.filter((x) => x.piece !== 'k' && x.attackers.length > 0);
    return {
      ply: i + 1,
      move: `${p.moveNumber}${p.color === 'white' ? '.' : '...'} ${p.san}`,
      side: p.color,
      winChanceBefore: Math.round(m.winBefore),
      winChanceAfter: Math.round(m.winAfter),
      ...(m.quality ? { quality: m.quality } : {}),
      ...(m.best ? { better: numberLine(m.best.line.slice(0, 6), p.moveNumber, p.color) } : {}),
      ideas: m.motifs.map(ideaFact).filter((x): x is string => !!x),
      board: {
        attacked: status.map((x) => `${piece(x)} (attacked by ${x.attackers.join(',')}; defended by ${x.defenders.join(',') || 'nothing'})`),
        hanging: ideas.hanging.map(piece),
        undefended: ideas.loose.map(piece),
        outposts: ideas.outposts.map(piece),
        pinned: ideas.pinned.map((x) => `${piece(x)} by ${x.by}`),
        passedPawns: ideas.passedPawns.map(piece),
        openFiles: ideas.openFiles,
      },
      fen: p.fenAfter,
    };
  });
  const facts = {
    players: { white: options.white ?? null, black: options.black ?? null },
    opening: openingName(plies.map((p) => p.san), 'en'),
    accuracy: { white: review.white.accuracy, black: review.black.accuracy },
    moves,
  };
  const system = [
    `You are a chess coach annotating a game for a learner. Write in ${LANGUAGE[options.lang]}.`,
    'You are given facts computed by a chess engine and by tactical detectors. Trust them: do not invent moves, evaluations or tactics that are not in the facts, and do not contradict the engine verdict.',
    'Comment only the moves that teach something: turning points, mistakes and why they are mistakes, strong moves and the idea behind them, threats, undefended or pinned pieces, sacrifices, plans. Skip routine moves. Aim for a remark on roughly one move in three.',
    'Each remark is one to three sentences. Name pieces and squares in words ("the knight on f6", "the square f7"). Never write moves in notation inside a remark, and do not use braces or parentheses.',
    'Answer with JSON only, in this shape: {"intro": "two or three sentences on what mattered in the game", "comments": [{"ply": <number from the facts>, "text": "<remark>"}]}',
  ].join('\n');
  return { system, user: `Game facts:\n${JSON.stringify(facts)}` };
}

export interface ParsedCommentary {
  intro: string;
  /** Remark per ply (1-based, as in the facts). */
  comments: Record<number, string>;
}

/** Text that is safe inside a `{ … }` remark of the annotated game. */
const clean = (s: unknown) => String(s ?? '').replace(/[{}()[\]]/g, '').replace(/\s+/g, ' ').replace(/\s+([.,;:!?])/g, '$1').trim().slice(0, 600);

/** The model's answer as remarks per ply. Throws when it is not the JSON asked for. */
export function parseCommentaryResponse(raw: string, plyCount: number): ParsedCommentary {
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  let data: { intro?: unknown; comments?: unknown };
  try {
    if (start < 0 || end <= start) throw new Error('no json');
    data = JSON.parse(raw.slice(start, end + 1));
  } catch {
    throw new Error('The model did not return the commentary as JSON.');
  }
  const comments: Record<number, string> = {};
  for (const item of Array.isArray(data.comments) ? data.comments : []) {
    const ply = Number((item as { ply?: unknown })?.ply);
    const text = clean((item as { text?: unknown })?.text);
    if (Number.isInteger(ply) && ply >= 1 && ply <= plyCount && text) comments[ply] = text;
  }
  return { intro: clean(data.intro), comments };
}
