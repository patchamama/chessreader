import { describe, it, expect, beforeEach } from 'vitest'
import { recognizeGames } from '@chess-ebook/chess-shared'
import { useStudyBoardStore } from './studyBoardStore'

const reset = () => useStudyBoardStore.getState().reset()

function sampleTree() {
  return recognizeGames('1. e4 e5 2. Nf3 Nc6 3. Bb5 a6')[0].tree
}

describe('studyBoardStore', () => {
  beforeEach(reset)

  it('starts with no active game', () => {
    const s = useStudyBoardStore.getState()
    expect(s.activeGame).toBeNull()
    expect(s.currentNodeId).toBeNull()
  })

  it('loadPosition sets active game and node', () => {
    const tree = sampleTree()
    const firstNode = tree.mainline[0]
    useStudyBoardStore.getState().loadPosition(tree, firstNode, false)
    const s = useStudyBoardStore.getState()
    expect(s.activeGame).toBe(tree)
    expect(s.currentNodeId).toBe(firstNode)
    expect(s.isInVariation).toBe(false)
  })

  it('clearGame drops the active game but keeps store usable', () => {
    const tree = sampleTree()
    useStudyBoardStore.getState().loadPosition(tree, tree.mainline[0], false)
    useStudyBoardStore.getState().clearGame()
    const s = useStudyBoardStore.getState()
    expect(s.activeGame).toBeNull()
    expect(s.currentNodeId).toBeNull()
  })

  it('toggles tool mode', () => {
    useStudyBoardStore.getState().setTool('pen')
    expect(useStudyBoardStore.getState().toolMode).toBe('pen')
    useStudyBoardStore.getState().setTool('pen')
    expect(useStudyBoardStore.getState().toolMode).toBe('none') // same tool toggles off
  })

  it('sets arrows and highlights for the current position', () => {
    const tree = sampleTree()
    const nodeId = tree.mainline[0]
    useStudyBoardStore.getState().loadPosition(tree, nodeId, false)
    useStudyBoardStore.getState().setArrows([{ startSquare: 'e2', endSquare: 'e4', color: 'red' }])
    useStudyBoardStore.getState().toggleHighlight('d4')
    const a = useStudyBoardStore.getState().annotations
    expect(a.arrows).toHaveLength(1)
    expect(a.highlights.d4).toBeDefined()
  })

  it('persists annotations per node and restores them on return', () => {
    const tree = sampleTree()
    const n0 = tree.mainline[0]
    const n1 = tree.mainline[1]
    const store = useStudyBoardStore.getState()

    store.loadPosition(tree, n0, false)
    store.setArrows([{ startSquare: 'e2', endSquare: 'e4', color: 'red' }])

    // navigate to next node — annotations should switch to that node's (empty)
    store.setCurrentNode(n1, false)
    expect(useStudyBoardStore.getState().annotations.arrows).toHaveLength(0)

    // return to first node — its arrow is restored
    store.setCurrentNode(n0, false)
    expect(useStudyBoardStore.getState().annotations.arrows).toHaveLength(1)
  })

  it('clearAnnotations wipes only the current position', () => {
    const tree = sampleTree()
    const n0 = tree.mainline[0]
    const store = useStudyBoardStore.getState()
    store.loadPosition(tree, n0, false)
    store.toggleHighlight('e4')
    store.clearAnnotations()
    expect(useStudyBoardStore.getState().annotations.highlights).toEqual({})
  })

  it('flips orientation', () => {
    expect(useStudyBoardStore.getState().orientation).toBe('white')
    useStudyBoardStore.getState().flip()
    expect(useStudyBoardStore.getState().orientation).toBe('black')
  })

  it('toggles autoplay', () => {
    useStudyBoardStore.getState().setAutoplay(true)
    expect(useStudyBoardStore.getState().autoplay).toBe(true)
  })
})
