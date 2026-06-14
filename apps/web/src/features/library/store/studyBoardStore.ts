import { create } from 'zustand'
import { Chess, type Square } from 'chess.js'
import type { Arrow } from 'react-chessboard'
import type { GameTree } from '@chess-ebook/chess-shared'

export type ToolMode = 'none' | 'arrows' | 'highlight' | 'pen' | 'eraser'

export interface StudyAnnotations {
  arrows: Arrow[]
  /** square -> CSS color */
  highlights: Record<string, string>
  /** canvas snapshot (data URL) of the pen layer for this position, or null */
  pen: string | null
}

const emptyAnnotations = (): StudyAnnotations => ({ arrows: [], highlights: {}, pen: null })

/** Position key used to bucket annotations. Null node = start position. */
const keyFor = (nodeId: string | null) => nodeId ?? '@start'

export interface StudyBoardState {
  activeGame: GameTree | null
  currentNodeId: string | null
  isInVariation: boolean
  orientation: 'white' | 'black'

  toolMode: ToolMode
  highlightColor: string
  brushColor: string
  brushSize: number
  autoplay: boolean

  /** annotations for the CURRENT position (mirror of annotationsByNode[currentKey]) */
  annotations: StudyAnnotations
  annotationsByNode: Record<string, StudyAnnotations>

  /** Free-play position once the user moves pieces; null = follow navigation. */
  playFen: string | null
  /** Currently selected source square for click-to-move, or null. */
  selectedSquare: string | null
  /** Legal destination squares for the selected piece. */
  legalTargets: string[]

  loadPosition: (game: GameTree, nodeId: string | null, inVariation: boolean) => void
  clearGame: () => void
  setCurrentNode: (nodeId: string | null, inVariation: boolean) => void
  /** Click-to-move: select a piece (showing legal targets) or play a move onto a target. */
  selectSquare: (square: string, baseFen: string) => void
  /** Drag-to-move: attempt a move; returns true if legal. */
  playMove: (from: string, to: string, baseFen: string) => boolean
  /** Discard the free-play position and any selection. */
  resetPlay: () => void
  flip: () => void
  setTool: (m: ToolMode) => void
  setHighlightColor: (c: string) => void
  setBrush: (color: string, size: number) => void
  setArrows: (arrows: Arrow[]) => void
  toggleHighlight: (square: string) => void
  setPen: (dataUrl: string | null) => void
  eraseAt: (square: string) => void
  clearAnnotations: () => void
  setAutoplay: (on: boolean) => void
  reset: () => void
}

const INITIAL = {
  activeGame: null as GameTree | null,
  currentNodeId: null as string | null,
  isInVariation: false,
  orientation: 'white' as const,
  toolMode: 'none' as ToolMode,
  highlightColor: '#22c55e',
  brushColor: '#ef4444',
  brushSize: 3,
  autoplay: false,
  annotations: emptyAnnotations(),
  annotationsByNode: {} as Record<string, StudyAnnotations>,
  playFen: null as string | null,
  selectedSquare: null as string | null,
  legalTargets: [] as string[],
}

/** Try a move from `fen`; returns the resulting FEN, or null if illegal. */
function tryMove(fen: string, from: string, to: string): string | null {
  try {
    const chess = new Chess(fen)
    const move = chess.move({ from, to, promotion: 'q' })
    return move ? chess.fen() : null
  } catch {
    return null
  }
}

/** Legal destination squares for the piece on `square` (empty if none/wrong turn). */
function legalTargetsFor(fen: string, square: string): string[] {
  try {
    const chess = new Chess(fen)
    return chess.moves({ square: square as Square, verbose: true }).map((m) => m.to)
  } catch {
    return []
  }
}

/** Persist the current annotations into the bucket and return the updated map. */
function persistCurrent(state: StudyBoardState): Record<string, StudyAnnotations> {
  return {
    ...state.annotationsByNode,
    [keyFor(state.currentNodeId)]: state.annotations,
  }
}

/** Read the stored annotations for a node (clone to avoid shared refs). */
function restore(byNode: Record<string, StudyAnnotations>, nodeId: string | null): StudyAnnotations {
  const stored = byNode[keyFor(nodeId)]
  if (!stored) return emptyAnnotations()
  return { arrows: [...stored.arrows], highlights: { ...stored.highlights }, pen: stored.pen }
}

export const useStudyBoardStore = create<StudyBoardState>((set) => ({
  ...INITIAL,

  loadPosition: (game, nodeId, inVariation) =>
    set((s) => {
      const byNode = persistCurrent(s)
      return {
        activeGame: game,
        currentNodeId: nodeId,
        isInVariation: inVariation,
        annotationsByNode: byNode,
        annotations: restore(byNode, nodeId),
        // Navigating discards any free-play position.
        playFen: null,
        selectedSquare: null,
        legalTargets: [],
      }
    }),

  clearGame: () =>
    set((s) => ({
      annotationsByNode: persistCurrent(s),
      activeGame: null,
      currentNodeId: null,
      isInVariation: false,
      annotations: emptyAnnotations(),
      playFen: null,
      selectedSquare: null,
      legalTargets: [],
    })),

  setCurrentNode: (nodeId, inVariation) =>
    set((s) => {
      const byNode = persistCurrent(s)
      return {
        currentNodeId: nodeId,
        isInVariation: inVariation,
        annotationsByNode: byNode,
        annotations: restore(byNode, nodeId),
        playFen: null,
        selectedSquare: null,
        legalTargets: [],
      }
    }),

  selectSquare: (square, baseFen) =>
    set((s) => {
      const fen = s.playFen ?? baseFen
      // If a piece is already selected and this square is a legal target → move.
      if (s.selectedSquare && s.legalTargets.includes(square)) {
        const next = tryMove(fen, s.selectedSquare, square)
        if (next) return { playFen: next, selectedSquare: null, legalTargets: [] }
      }
      // Clicking the selected square again deselects.
      if (s.selectedSquare === square) {
        return { selectedSquare: null, legalTargets: [] }
      }
      // Otherwise try to select the piece on this square (only if it has legal moves).
      const targets = legalTargetsFor(fen, square)
      if (targets.length === 0) return { selectedSquare: null, legalTargets: [] }
      return { selectedSquare: square, legalTargets: targets }
    }),

  playMove: (from, to, baseFen) => {
    const s = useStudyBoardStore.getState()
    const fen = s.playFen ?? baseFen
    const next = tryMove(fen, from, to)
    if (!next) return false
    set({ playFen: next, selectedSquare: null, legalTargets: [] })
    return true
  },

  resetPlay: () => set({ playFen: null, selectedSquare: null, legalTargets: [] }),

  flip: () => set((s) => ({ orientation: s.orientation === 'white' ? 'black' : 'white' })),

  setTool: (m) => set((s) => ({ toolMode: s.toolMode === m ? 'none' : m })),

  setHighlightColor: (c) => set({ highlightColor: c }),

  setBrush: (color, size) => set({ brushColor: color, brushSize: size }),

  setArrows: (arrows) => set((s) => ({ annotations: { ...s.annotations, arrows } })),

  toggleHighlight: (square) =>
    set((s) => {
      const highlights = { ...s.annotations.highlights }
      if (highlights[square]) delete highlights[square]
      else highlights[square] = s.highlightColor
      return { annotations: { ...s.annotations, highlights } }
    }),

  setPen: (dataUrl) => set((s) => ({ annotations: { ...s.annotations, pen: dataUrl } })),

  eraseAt: (square) =>
    set((s) => {
      const highlights = { ...s.annotations.highlights }
      delete highlights[square]
      const arrows = s.annotations.arrows.filter(
        (a) => a.startSquare !== square && a.endSquare !== square,
      )
      return { annotations: { ...s.annotations, arrows, highlights } }
    }),

  clearAnnotations: () => set({ annotations: emptyAnnotations() }),

  setAutoplay: (on) => set({ autoplay: on }),

  reset: () => set({ ...INITIAL, annotations: emptyAnnotations(), annotationsByNode: {} }),
}))
