import { useEffect } from 'react'
import type { GameTree } from '@chess-ebook/chess-shared'
import { useViewerStore } from '../store/viewerStore'

/**
 * Registers global keyboard listeners for ← → Space keys.
 * Navigates the last active game tree.
 *
 * trees: map of treeId → GameTree, supplied by the page that renders games.
 */
export function useKeyboardNavigation(trees: Map<string, GameTree>) {
  useEffect(() => {
    const handle = (e: KeyboardEvent) => {
      // Ignore when focus is inside an input/textarea/select
      const tag = (e.target as HTMLElement)?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return

      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight' && e.key !== ' ') return
      e.preventDefault()

      const { activeTreeId, currentNodeId, isInVariation, selectNode, goToStart } =
        useViewerStore.getState()

      if (!activeTreeId) return
      const tree = trees.get(activeTreeId)
      if (!tree) return

      const curId     = currentNodeId[activeTreeId] ?? null
      const inVar     = isInVariation[activeTreeId] ?? false
      const isForward = e.key === 'ArrowRight' || e.key === ' '

      if (isForward) {
        if (!curId) {
          if (tree.mainline.length > 0) selectNode(activeTreeId, tree.mainline[0], false)
          return
        }
        if (inVar) {
          for (const lines of tree.variations.values()) {
            for (const line of lines) {
              const idx = line.indexOf(curId)
              if (idx >= 0 && idx < line.length - 1) {
                selectNode(activeTreeId, line[idx + 1], true)
                return
              }
            }
          }
        } else {
          const idx = tree.mainline.indexOf(curId)
          if (idx >= 0 && idx < tree.mainline.length - 1) {
            selectNode(activeTreeId, tree.mainline[idx + 1], false)
          }
        }
      } else {
        // backward
        if (!curId) return
        if (inVar) {
          for (const lines of tree.variations.values()) {
            for (const line of lines) {
              const idx = line.indexOf(curId)
              if (idx === 0) {
                const parentNode = tree.nodes.get(curId)
                if (parentNode?.parentId) selectNode(activeTreeId, parentNode.parentId, false)
                else goToStart(activeTreeId)
                return
              }
              if (idx > 0) {
                selectNode(activeTreeId, line[idx - 1], true)
                return
              }
            }
          }
        } else {
          const idx = tree.mainline.indexOf(curId)
          if (idx === 0) goToStart(activeTreeId)
          else if (idx > 0) selectNode(activeTreeId, tree.mainline[idx - 1], false)
        }
      }
    }

    window.addEventListener('keydown', handle)
    return () => window.removeEventListener('keydown', handle)
  }, [trees])
}
