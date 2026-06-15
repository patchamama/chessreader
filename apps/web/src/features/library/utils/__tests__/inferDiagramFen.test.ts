import { describe, it, expect } from 'vitest'
import { inferDiagramFen, INITIAL_FEN } from '../inferDiagramFen'
import type { GameTree, GameNode } from '@chess-ebook/chess-shared'

function node(id: string, fen: string, charStart: number): GameNode {
  return { id, san: '', fen, charStart } as unknown as GameNode
}

/** Minimal tree with a mainline whose nodes carry fen + charStart. */
function tree(nodes: GameNode[]): GameTree {
  const map = new Map<string, GameNode>()
  for (const n of nodes) map.set(n.id, n)
  return {
    nodes: map,
    mainline: nodes.map((n) => n.id),
  } as unknown as GameTree
}

const FEN_AFTER_E4 = 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1'
const FEN_AFTER_E5 = 'rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq e6 0 2'

describe('inferDiagramFen', () => {
  it('returns the initial FEN when there are no games', () => {
    expect(inferDiagramFen([], 100)).toBe(INITIAL_FEN)
  })

  it('returns the initial FEN when the image precedes every move', () => {
    const games = [{ tree: tree([node('n1', FEN_AFTER_E4, 500)]) }]
    expect(inferDiagramFen(games, 100)).toBe(INITIAL_FEN)
  })

  it('returns the FEN of the last mainline move before the image offset', () => {
    const games = [
      {
        tree: tree([
          node('n1', FEN_AFTER_E4, 10),
          node('n2', FEN_AFTER_E5, 20),
        ]),
      },
    ]
    // image at offset 25 → after e5
    expect(inferDiagramFen(games, 25)).toBe(FEN_AFTER_E5)
    // image at offset 15 → after e4 (before e5)
    expect(inferDiagramFen(games, 15)).toBe(FEN_AFTER_E4)
  })

  it('uses the nearest preceding mainline node across multiple games', () => {
    const games = [
      { tree: tree([node('a1', FEN_AFTER_E4, 10)]) },
      { tree: tree([node('b1', FEN_AFTER_E5, 100)]) },
    ]
    // offset 120 → b1 from the second game is nearest preceding
    expect(inferDiagramFen(games, 120)).toBe(FEN_AFTER_E5)
  })

  it('ignores non-mainline / fen-less nodes', () => {
    const t = tree([node('n1', FEN_AFTER_E4, 10)])
    // add a variation node not on the mainline, closer to the image
    ;(t.nodes as Map<string, GameNode>).set('v1', node('v1', FEN_AFTER_E5, 30))
    expect(inferDiagramFen([{ tree: t }], 40)).toBe(FEN_AFTER_E4)
  })
})
