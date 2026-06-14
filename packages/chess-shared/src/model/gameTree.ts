/**
 * GameTree model — pure data types, no chess logic here.
 *
 * Structure:
 *  - Root node (id="root") represents the starting position.
 *  - Each subsequent node is a chess move from its parent.
 *  - Variations fork off any node and are tracked in the `variations` map.
 *  - The mainline is the path from root along firstChild links.
 */

export type Color = 'white' | 'black';

export interface GameNode {
  id: string;
  san: string;
  fen: string;
  /** From-square in algebraic (e.g. "e2") */
  from: string;
  /** To-square in algebraic (e.g. "e4") */
  to: string;
  moveNumber: number;
  color: Color;
  parentId: string | null;
  /** Original notation as written in the source (e.g. "♘f3", "Cf3"); falls back to `san`. */
  rawSan?: string;
  /** true when the move was rejected by the chess engine as illegal */
  invalid?: boolean;
}

export interface GameTree {
  /** Starting FEN (standard start if null) */
  startFen: string;
  /** All nodes by id */
  nodes: Map<string, GameNode>;
  /** Ordered mainline node ids (root to last mainline move) */
  mainline: string[];
  /** Variation branches: key = parent node id, value = ordered lists of variation lines (each line is an array of node ids) */
  variations: Map<string, string[][]>;
}

export function createGameTree(startFen: string): GameTree {
  return {
    startFen,
    nodes: new Map(),
    mainline: [],
    variations: new Map(),
  };
}

/** Returns the path from root to a given node (list of node ids). */
export function pathToNode(tree: GameTree, nodeId: string): string[] {
  const path: string[] = [];
  let current: GameNode | undefined = tree.nodes.get(nodeId);
  while (current) {
    path.unshift(current.id);
    current = current.parentId ? tree.nodes.get(current.parentId) : undefined;
  }
  return path;
}

/** Returns all nodes on the mainline as an ordered array. */
export function mainlineNodes(tree: GameTree): GameNode[] {
  return tree.mainline
    .map(id => tree.nodes.get(id))
    .filter((n): n is GameNode => n !== undefined);
}

/** Serialises GameTree to a plain JSON-safe object for golden fixture comparison. */
export function serializeTree(tree: GameTree): SerializedGameTree {
  return {
    startFen: tree.startFen,
    nodes: Object.fromEntries(
      Array.from(tree.nodes.entries()).map(([id, node]) => [id, node])
    ),
    mainline: tree.mainline,
    variations: Object.fromEntries(
      Array.from(tree.variations.entries())
    ),
  };
}

export interface SerializedGameTree {
  startFen: string;
  nodes: Record<string, GameNode>;
  mainline: string[];
  variations: Record<string, string[][]>;
}
