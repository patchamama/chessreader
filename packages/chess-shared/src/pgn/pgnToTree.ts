/**
 * Converts a sequence of SAN tokens into a GameTree using chess.js for validation.
 *
 * Variation handling:
 *  - '(' forks a variation off the CURRENT node (the last successfully placed node)
 *  - ')' returns to the parent of the variation start (natural tree parent pointer)
 *  - Nested variations are supported
 *
 * Illegal moves:
 *  - A move that chess.js rejects → node marked invalid, line stops (no more moves in that branch)
 *  - Subsequent moves are skipped until the branch ends
 */

import { Chess } from 'chess.js';
import { type SanToken } from '../notation/sanTokenizer.js';
import {
  type GameTree,
  type GameNode,
  createGameTree,
} from '../model/gameTree.js';

const STANDARD_START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

let _nodeCounter = 0;
function nextId(): string {
  return `node-${++_nodeCounter}`;
}

export function resetNodeCounter(): void {
  _nodeCounter = 0;
}

interface BuildContext {
  chess: Chess;
  tree: GameTree;
  /** id of the node that is currently the "tip" of this branch */
  currentNodeId: string | null;
  /** FEN before the last move was played (used to fork variations) */
  fenBeforeLastMove: string;
  /** id of the parent of the last move placed (for variation parent tracking) */
  parentBeforeLastMove: string | null;
  /** stack for variation return points: each entry = [chess state to restore, node id to return to] */
  variationStack: Array<{
    fen: string;
    returnToNodeId: string | null;
    lineKeyDepth: number;
    proseLine: string[] | null;
    /** the line array for THIS paren variation (created lazily on first move) */
    line: string[] | null;
  }>;
  /** whether this branch is dead (last move was invalid) */
  dead: boolean;
  moveNumber: number;
  color: 'white' | 'black';
  /** mainline nodes keyed by "moveNumber:color" — anchors for prose analysis variations */
  mainlineByKey: Map<string, string>;
  /** false once the mainline is finished (a result token, or first re-anchor) → prose analysis mode */
  onMainline: boolean;
  /** the prose analysis variation line currently being extended (node ids), or null on mainline */
  proseLine: string[] | null;
}

function moveKey(moveNumber: number, color: 'white' | 'black'): string {
  return `${moveNumber}:${color}`;
}

/** Can `san` be legally played from `fen`? (uses chess.js as the oracle) */
function isLegalFrom(fen: string, san: string): boolean {
  try {
    const c = new Chess(fen);
    c.move(san);
    return true;
  } catch {
    return false;
  }
}

export function buildGameTree(
  tokens: SanToken[],
  startFen: string = STANDARD_START_FEN,
): GameTree {
  resetNodeCounter();
  const tree = createGameTree(startFen);
  const chess = new Chess(startFen);

  const ctx: BuildContext = {
    chess,
    tree,
    currentNodeId: null,
    fenBeforeLastMove: startFen,
    parentBeforeLastMove: null,
    variationStack: [],
    dead: false,
    moveNumber: 1,
    color: 'white',
    mainlineByKey: new Map(),
    onMainline: true,
    proseLine: null,
  };

  for (const token of tokens) {
    if (token.type === 'result') {
      // The mainline is complete; anything after is analysis prose.
      ctx.onMainline = false;
      continue;
    }

    if (token.type === 'move-number') {
      if (ctx.variationStack.length === 0) {
        ctx.moveNumber = token.moveNumber!;
        ctx.color = token.isEllipsis ? 'black' : 'white';
      }
      continue;
    }

    if (token.type === 'variation-open') {
      // Save the CURRENT chess state (after last move) so we can return to it
      const currentFen = ctx.chess.fen();
      const currentNodeId = ctx.currentNodeId;
      ctx.variationStack.push({
        fen: currentFen,
        returnToNodeId: currentNodeId,
        lineKeyDepth: ctx.variationStack.length + 1,
        proseLine: ctx.proseLine,
        line: null,
      });
      // Load the state BEFORE the last move was played — the variation is an alternative to that move
      ctx.chess.load(ctx.fenBeforeLastMove);
      ctx.currentNodeId = ctx.parentBeforeLastMove;
      ctx.dead = false;
      // A parenthesised variation is its own line, not the enclosing prose line.
      ctx.proseLine = null;
      continue;
    }

    if (token.type === 'variation-close') {
      if (ctx.variationStack.length > 0) {
        const saved = ctx.variationStack.pop()!;
        ctx.chess.load(saved.fen);
        ctx.currentNodeId = saved.returnToNodeId;
        ctx.dead = false;
        // Resume the enclosing prose analysis line (if any) after the paren.
        ctx.proseLine = saved.proseLine;
      }
      continue;
    }

    if (token.type !== 'move') continue;

    if (ctx.dead) continue;

    const san = token.san!;
    const inParen = ctx.variationStack.length > 0;

    // ── Prose analysis re-anchoring (validation-driven) ────────────────────
    // Once past the mainline (a result was seen) and not inside parentheses,
    // a move that is NOT legal continuing the current line is the start of a
    // new analysis variation. chess.js decides where it anchors: try the parent
    // of the mainline move with the same (number,color); fall back to scanning
    // mainline parents for the first position where the move is legal.
    if (!inParen && !ctx.onMainline) {
      const continues = !ctx.dead && isLegalFrom(ctx.chess.fen(), san);
      if (!continues || ctx.proseLine === null) {
        const anchor = findProseAnchor(ctx, token);
        if (anchor) {
          ctx.chess.load(anchor.parentFen);
          ctx.currentNodeId = anchor.parentId;
          ctx.fenBeforeLastMove = anchor.parentFen;
          ctx.parentBeforeLastMove = anchor.parentId;
          ctx.dead = false;
          ctx.proseLine = openProseLine(tree, anchor.parentId);
        }
      }
    }

    const parentId = ctx.currentNodeId;
    const fenBeforeMove = ctx.chess.fen();
    const parentFen = fenBeforeMove;

    let moveResult: ReturnType<Chess['move']> | null = null;
    let isInvalid = false;

    try {
      moveResult = ctx.chess.move(san);
    } catch {
      isInvalid = true;
    }

    const nodeId = nextId();
    const node: GameNode = {
      id: nodeId,
      // Canonical SAN from chess.js (strips !/?/!! annotations) when legal;
      // the original token (with glyphs/annotations) is kept in rawSan.
      san: moveResult?.san ?? san,
      fen: isInvalid ? parentFen : ctx.chess.fen(),
      from: moveResult?.from ?? '',
      to: moveResult?.to ?? '',
      moveNumber: token.moveNumber ?? ctx.moveNumber,
      color: token.color ?? ctx.color,
      parentId,
      ...(token.rawSan ? { rawSan: token.rawSan } : {}),
      ...(token.charStart !== undefined
        ? { charStart: token.charStart, charEnd: token.charEnd }
        : {}),
      ...(isInvalid ? { invalid: true } : {}),
    };

    tree.nodes.set(nodeId, node);

    if (isInvalid) {
      ctx.dead = true;
      continue;
    }

    if (inParen) {
      // Parenthesised variation: each '(' owns one line under its branch point,
      // created lazily on the first move so empty/nested parens don't collide.
      const stackTop = ctx.variationStack[ctx.variationStack.length - 1];
      if (stackTop.line === null) {
        stackTop.line = openProseLine(tree, stackTop.returnToNodeId);
      }
      stackTop.line.push(nodeId);
    } else if (ctx.proseLine !== null) {
      // Re-anchored prose analysis line.
      ctx.proseLine.push(nodeId);
    } else {
      // Mainline.
      tree.mainline.push(nodeId);
      ctx.mainlineByKey.set(moveKey(node.moveNumber, node.color), nodeId);
    }

    ctx.currentNodeId = nodeId;
    ctx.fenBeforeLastMove = fenBeforeMove;
    ctx.parentBeforeLastMove = parentId;

    if (token.color === 'black') {
      ctx.moveNumber = (token.moveNumber ?? ctx.moveNumber) + 1;
      ctx.color = 'white';
    } else {
      ctx.color = 'black';
    }
  }

  return tree;
}

/**
 * Find where a prose analysis move should anchor. The natural candidate is the
 * PARENT of the mainline move sharing the same (number, color) — the author
 * writes "19. Be4" to replace mainline move 19. chess.js validates the candidate;
 * if it fails, scan mainline parents for the first legal anchor.
 */
function findProseAnchor(
  ctx: BuildContext,
  token: SanToken,
): { parentId: string | null; parentFen: string } | null {
  const san = token.san!;
  const tree = ctx.tree;

  const parentFenOf = (nodeId: string): { parentId: string | null; parentFen: string } => {
    const node = tree.nodes.get(nodeId)!;
    const parentId = node.parentId;
    const parentFen = parentId ? tree.nodes.get(parentId)!.fen : tree.startFen;
    return { parentId, parentFen };
  };

  // 1. Direct key match: parent of the mainline move with this (number, color).
  if (token.moveNumber !== undefined && token.color) {
    const keyed = ctx.mainlineByKey.get(moveKey(token.moveNumber, token.color));
    if (keyed) {
      const cand = parentFenOf(keyed);
      if (isLegalFrom(cand.parentFen, san)) return cand;
    }
  }

  // 2. Fallback: scan all mainline nodes; anchor at the parent of the first
  //    mainline node from whose preceding position the move is legal.
  for (const nodeId of tree.mainline) {
    const cand = parentFenOf(nodeId);
    if (isLegalFrom(cand.parentFen, san)) return cand;
  }

  return null;
}

/** Open a fresh prose-analysis variation line under the given parent node. */
function openProseLine(tree: GameTree, parentId: string | null): string[] {
  const key = parentId ?? 'root';
  if (!tree.variations.has(key)) tree.variations.set(key, []);
  const lines = tree.variations.get(key)!;
  const line: string[] = [];
  lines.push(line);
  return line;
}
