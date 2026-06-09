import { describe, it, expect, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useViewerStore } from '../store/viewerStore'
import { useGameNavigation } from '../hooks/useGameNavigation'
import { buildGameTree, resetNodeCounter } from '@chess-ebook/chess-shared'
import { tokenize } from '@chess-ebook/chess-shared'

// Simple PGN: 1. e4 e5 2. Nf3 Nc6 (1. d4 d5)
const SIMPLE_PGN = '1. e4 e5 2. Nf3 Nc6'
const VARIATION_PGN = '1. e4 e5 (1... c5) 2. Nf3'

const STANDARD_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'

function makeTree(pgn: string) {
  resetNodeCounter()
  const tokens = tokenize(pgn)
  return buildGameTree(tokens, STANDARD_FEN)
}

describe('useGameNavigation', () => {
  const tree = makeTree(SIMPLE_PGN)
  const treeId = 'nav-test'

  beforeEach(() => {
    useViewerStore.setState({ currentNodeId: {}, orientation: 'white', isInVariation: {} })
  })

  it('returns start FEN when no node selected', () => {
    const { result } = renderHook(() => useGameNavigation(treeId, tree))
    expect(result.current.fen).toBe(STANDARD_FEN)
    expect(result.current.lastMove).toBeNull()
  })

  it('returns correct fen+lastMove when node selected', () => {
    const firstNodeId = tree.mainline[0]
    const firstNode = tree.nodes.get(firstNodeId)!

    useViewerStore.setState({ currentNodeId: { [treeId]: firstNodeId }, isInVariation: {} })
    const { result } = renderHook(() => useGameNavigation(treeId, tree))

    expect(result.current.fen).toBe(firstNode.fen)
    expect(result.current.lastMove).toEqual({ from: firstNode.from, to: firstNode.to })
  })

  it('next moves to the next mainline node', () => {
    const { result } = renderHook(() => useGameNavigation(treeId, tree))

    act(() => { result.current.next() })
    expect(useViewerStore.getState().currentNodeId[treeId]).toBe(tree.mainline[0])

    act(() => { result.current.next() })
    expect(useViewerStore.getState().currentNodeId[treeId]).toBe(tree.mainline[1])
  })

  it('prev moves to the previous node', () => {
    useViewerStore.setState({ currentNodeId: { [treeId]: tree.mainline[1] }, isInVariation: {} })
    const { result } = renderHook(() => useGameNavigation(treeId, tree))

    act(() => { result.current.prev() })
    expect(useViewerStore.getState().currentNodeId[treeId]).toBe(tree.mainline[0])
  })

  it('prev from first node goes to start (null)', () => {
    useViewerStore.setState({ currentNodeId: { [treeId]: tree.mainline[0] }, isInVariation: {} })
    const { result } = renderHook(() => useGameNavigation(treeId, tree))

    act(() => { result.current.prev() })
    expect(useViewerStore.getState().currentNodeId[treeId]).toBeNull()
  })

  it('enterVariation navigates into a variation child', () => {
    const varTree = makeTree(VARIATION_PGN)
    const varTreeId = 'var-test'
    useViewerStore.setState({ currentNodeId: {}, isInVariation: {} })

    const { result } = renderHook(() => useGameNavigation(varTreeId, varTree))

    // Navigate to first mainline node (e4) which has a variation
    act(() => { result.current.next() })

    const currentId = useViewerStore.getState().currentNodeId[varTreeId]
    // Find the parent of the variation
    const variations = varTree.variations
    const varParent = [...variations.keys()][0]
    const varLines = variations.get(varParent)!
    const firstVarNodeId = varLines[0][0]

    act(() => { result.current.enterVariation(firstVarNodeId) })

    expect(useViewerStore.getState().currentNodeId[varTreeId]).toBe(firstVarNodeId)
    expect(useViewerStore.getState().isInVariation[varTreeId]).toBe(true)
    void currentId // used above
  })

  it('returnToMainline goes back to the mainline parent of the current variation', () => {
    const varTree = makeTree(VARIATION_PGN)
    const varTreeId = 'return-test'
    useViewerStore.setState({ currentNodeId: {}, isInVariation: {} })

    const { result } = renderHook(() => useGameNavigation(varTreeId, varTree))

    // Navigate to mainline[0] (e4)
    act(() => { result.current.next() })
    const mainlineParentId = useViewerStore.getState().currentNodeId[varTreeId]

    // Enter variation
    const varLines = [...varTree.variations.values()][0]
    const firstVarNodeId = varLines[0][0]
    act(() => { result.current.enterVariation(firstVarNodeId) })

    // Return to mainline
    act(() => { result.current.returnToMainline() })
    expect(useViewerStore.getState().currentNodeId[varTreeId]).toBe(mainlineParentId)
    expect(useViewerStore.getState().isInVariation[varTreeId]).toBe(false)
  })

  it('selectNode directly updates the store', () => {
    const { result } = renderHook(() => useGameNavigation(treeId, tree))
    const nodeId = tree.mainline[2]

    act(() => { result.current.selectNode(nodeId, false) })
    expect(useViewerStore.getState().currentNodeId[treeId]).toBe(nodeId)
  })
})
