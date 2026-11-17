import type { RecognizedGame } from '../recognition/recognizeGames.js';
import { buildNarrationScript } from '../teaching/narration.js';
import type { Lang } from '../teaching/concepts.js';

/** A position without its move counters: the same position whatever move it was reached on. */
export function positionKey(fen: string): string {
  return fen.trim().split(/\s+/).slice(0, 4).join(' ');
}

/** 64-bit FNV-1a of the position key, as 16 hex characters (index and shard key). */
export function positionHash(fen: string): string {
  const key = positionKey(fen);
  let h = 0xcbf29ce484222325n;
  for (let i = 0; i < key.length; i++) {
    h ^= BigInt(key.charCodeAt(i));
    h = (h * 0x100000001b3n) & 0xffffffffffffffffn;
  }
  return h.toString(16).padStart(16, '0');
}

/** What an author wrote about a position of a game. */
export interface PositionComment {
  key: string;
  hash: string;
  /** The position after the move commented. */
  fen: string;
  /** Half-move of the game (1 = White's first move). */
  ply: number;
  san: string;
  moveNumber: number;
  color: 'white' | 'black';
  text: string;
  lang: Lang;
}

export interface ExtractOptions {
  lang?: Lang;
  /** Fewer letters of prose than this (moves aside) and it is not a comment. */
  minLetters?: number;
  /** Longer remarks are cut at a sentence end near this length. */
  maxLength?: number;
}

const MOVE_LIKE = /\b\d{1,3}(?:\.{1,3}|…)?\s*|(?:O-O(?:-O)?|[KQRBNDTAC]?[a-h]?[1-8]?x?[a-h][1-8](?:=?[QRBNDTAC])?)[+#]?[!?]*/g;

/** Cut a long remark at the end of a sentence. */
function trim(text: string, max: number): string {
  const clean = text.replace(/\s+/g, ' ').trim();
  if (clean.length <= max) return clean;
  const cut = clean.slice(0, max);
  const end = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf('! '), cut.lastIndexOf('? '));
  return end > max * 0.4 ? cut.slice(0, end + 1) : `${cut.trimEnd()}…`;
}

/**
 * The remarks of a book's game, each with the position it speaks about: the
 * prose that follows a move of the main line (a line of bare moves is not a
 * remark). These pairs make the human commentary database: a position met in
 * another game can borrow what an author said about it.
 */
export function extractPositionComments(text: string, game: RecognizedGame, options: ExtractOptions = {}): PositionComment[] {
  const minLetters = options.minLetters ?? 30;
  const maxLength = options.maxLength ?? 700;
  const tree = game.tree;
  const plyOf = new Map(tree.mainline.map((id, i) => [id, i + 1]));
  const steps = buildNarrationScript(text, game, options.lang ? { lang: options.lang } : {});
  const out: PositionComment[] = [];
  for (const step of steps) {
    if (step.kind !== 'comment' || !step.nodeId) continue;
    const ply = plyOf.get(step.nodeId);
    const node = tree.nodes.get(step.nodeId);
    if (!ply || !node) continue;
    const raw = text.slice(step.charStart, step.charEnd).replace(/\uFFFC/g, ' ');
    const prose = raw.replace(MOVE_LIKE, ' ');
    const letters = prose.replace(/[^A-Za-zÀ-ÿ]/g, '').length;
    if (letters < minLetters) continue;
    // A remark is mostly words: analysis that is mostly moves with a name or two is not.
    const words = (prose.match(/[A-Za-zÀ-ÿ]{3,}/g) ?? []).length;
    const moves = (raw.match(MOVE_LIKE) ?? []).filter((m) => /[a-h][1-8]|O-O/.test(m)).length;
    if (words < 6 || words < moves * 1.5) continue;
    out.push({
      key: positionKey(node.fen), hash: positionHash(node.fen), fen: node.fen, ply, san: node.san,
      moveNumber: node.moveNumber, color: node.color, text: trim(raw, maxLength),
      lang: options.lang ?? 'es',
    });
  }
  return out;
}
