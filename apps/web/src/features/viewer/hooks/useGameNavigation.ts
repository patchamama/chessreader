import { useCallback } from 'react'
import type { GameTree } from '@chess-ebook/chess-shared'
import { useViewerStore } from '../store/viewerStore'

const STANDARD_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'

export interface LastMove {
  from: string
  to: string
}

export interface GameNavigationResult {
  fen: string
  lastMove: LastMove | null
  selectNode: (nodeId: string, inVariation: boolean) => void
  next: () => void
  prev: () => void
  enterVariation: (nodeId: string) => void
  returnToMainline: () => void
}

export function useGameNavigation(treeId: string, tree: GameTree): GameNavigationResult {
  const currentNodeId = useViewerStore((s) => s.currentNodeId[treeId] ?? null)
  const isInVariation = useViewerStore((s) => s.isInVariation[treeId] ?? false)
  const { selectNode: storeSelectNode, goToStart } = useViewerStore.getState()

  const currentNode = currentNodeId ? tree.nodes.get(currentNodeId) : undefined
  const fen = currentNode?.fen ?? tree.startFen ?? STANDARD_FEN
  const lastMove: LastMove | null =
    currentNode && currentNode.from
      ? { from: currentNode.from, to: currentNode.to }
      : null

  const selectNode = useCallback(
    (nodeId: string, inVar: boolean) => storeSelectNode(treeId, nodeId, inVar),
    [treeId, storeSelectNode]
  )

  const next = useCallback(() => {
    if (!currentNodeId) {
      // At start: go to first mainline node
      if (tree.mainline.length > 0) {
        storeSelectNode(treeId, tree.mainline[0], false)
      }
      return
    }
    if (isInVariation) {
      // Walk variation lines
      for (const lines of tree.variations.values()) {
        for (const line of lines) {
          const idx = line.indexOf(currentNodeId)
          if (idx >= 0 && idx < line.length - 1) {
            storeSelectNode(treeId, line[idx + 1], true)
            return
          }
        }
      }
    } else {
      const idx = tree.mainline.indexOf(currentNodeId)
      if (idx >= 0 && idx < tree.mainline.length - 1) {
        storeSelectNode(treeId, tree.mainline[idx + 1], false)
      }
    }
  }, [treeId, currentNodeId, isInVariation, tree, storeSelectNode])

  const prev = useCallback(() => {
    if (!currentNodeId) return
    if (isInVariation) {
      for (const lines of tree.variations.values()) {
        for (const line of lines) {
          const idx = line.indexOf(currentNodeId)
          if (idx === 0) {
            // Back to parent of the variation
            const parentNode = tree.nodes.get(currentNodeId)
            if (parentNode?.parentId) {
              storeSelectNode(treeId, parentNode.parentId, false)
            } else {
              goToStart(treeId)
            }
            return
          }
          if (idx > 0) {
            storeSelectNode(treeId, line[idx - 1], true)
            return
          }
        }
      }
    } else {
      const idx = tree.mainline.indexOf(currentNodeId)
      if (idx === 0) {
        goToStart(treeId)
      } else if (idx > 0) {
        storeSelectNode(treeId, tree.mainline[idx - 1], false)
      }
    }
  }, [treeId, currentNodeId, isInVariation, tree, storeSelectNode, goToStart])

  const enterVariation = useCallback(
    (nodeId: string) => storeSelectNode(treeId, nodeId, true),
    [treeId, storeSelectNode]
  )

  const returnToMainline = useCallback(() => {
    if (!currentNodeId) return
    // Find the node's ancestor that is on the mainline
    let node = tree.nodes.get(currentNodeId)
    while (node) {
      if (node.parentId && tree.mainline.includes(node.parentId)) {
        storeSelectNode(treeId, node.parentId, false)
        return
      }
      if (node.parentId) {
        node = tree.nodes.get(node.parentId)
      } else {
        break
      }
    }
    // Fallback: find the variation parent from variations map
    for (const [parentId, _lines] of tree.variations.entries()) {
      if (parentId !== 'root' && tree.mainline.includes(parentId)) {
        storeSelectNode(treeId, parentId, false)
        return
      }
    }
    goToStart(treeId)
  }, [treeId, currentNodeId, tree, storeSelectNode, goToStart])

  return { fen, lastMove, selectNode, next, prev, enterVariation, returnToMainline }
}
