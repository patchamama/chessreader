import { describe, it, expect, beforeEach } from 'vitest'
import { useViewerStore } from '../store/viewerStore'

const TREE_ID = 'test-tree'

describe('viewerStore', () => {
  beforeEach(() => {
    useViewerStore.setState({
      currentNodeId: {},
      orientation: 'white',
      isInVariation: {},
    })
  })

  it('initial state has white orientation', () => {
    expect(useViewerStore.getState().orientation).toBe('white')
  })

  it('selectNode sets currentNodeId for a treeId', () => {
    useViewerStore.getState().selectNode(TREE_ID, 'node-1', false)
    expect(useViewerStore.getState().currentNodeId[TREE_ID]).toBe('node-1')
  })

  it('selectNode sets isInVariation flag', () => {
    useViewerStore.getState().selectNode(TREE_ID, 'node-2', true)
    expect(useViewerStore.getState().isInVariation[TREE_ID]).toBe(true)
  })

  it('flipOrientation toggles white->black', () => {
    useViewerStore.setState({ orientation: 'white' })
    useViewerStore.getState().flipOrientation()
    expect(useViewerStore.getState().orientation).toBe('black')
  })

  it('flipOrientation toggles black->white', () => {
    useViewerStore.setState({ orientation: 'black' })
    useViewerStore.getState().flipOrientation()
    expect(useViewerStore.getState().orientation).toBe('white')
  })

  it('goToStart clears currentNodeId for the treeId', () => {
    useViewerStore.getState().selectNode(TREE_ID, 'node-5', false)
    useViewerStore.getState().goToStart(TREE_ID)
    expect(useViewerStore.getState().currentNodeId[TREE_ID]).toBeNull()
    expect(useViewerStore.getState().isInVariation[TREE_ID]).toBe(false)
  })
})
