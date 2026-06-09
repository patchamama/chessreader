import { create } from 'zustand'

interface ViewerState {
  /** currentNodeId per treeId (null = at start position) */
  currentNodeId: Record<string, string | null>
  orientation: 'white' | 'black'
  /** whether viewer is currently inside a variation per treeId */
  isInVariation: Record<string, boolean>

  selectNode: (treeId: string, nodeId: string, inVariation: boolean) => void
  flipOrientation: () => void
  goToStart: (treeId: string) => void
}

export const useViewerStore = create<ViewerState>((set) => ({
  currentNodeId: {},
  orientation: 'white',
  isInVariation: {},

  selectNode: (treeId, nodeId, inVariation) =>
    set((s) => ({
      currentNodeId: { ...s.currentNodeId, [treeId]: nodeId },
      isInVariation: { ...s.isInVariation, [treeId]: inVariation },
    })),

  flipOrientation: () =>
    set((s) => ({ orientation: s.orientation === 'white' ? 'black' : 'white' })),

  goToStart: (treeId) =>
    set((s) => ({
      currentNodeId: { ...s.currentNodeId, [treeId]: null },
      isInVariation: { ...s.isInVariation, [treeId]: false },
    })),
}))
