import { actionCues, type GameTree, type RecognizedGame } from '@chess-ebook/chess-shared'
import { chipAction, setWordHighlight, wordRange } from './guideChips'
import { useNarrationStore } from './narrationStore'
import { useStudyBoardStore } from '../store/studyBoardStore'

const placement = (fen: string) => fen.split(' ').slice(0, 4).join(' ')

/** Where a position is in the chapter's games: the node that leads to it (null node: the start position). */
export function locatePosition(games: RecognizedGame[], fen: string): { tree: GameTree; nodeId: string | null } | null {
  const here = placement(fen)
  for (const { tree } of games) {
    if (placement(tree.startFen) === here) return { tree, nodeId: null }
    for (const node of tree.nodes.values()) if (!node.invalid && placement(node.fen) === here) return { tree, nodeId: node.id }
  }
  return null
}

const narratorRunning = () => ['playing', 'waiting-move'].includes(useNarrationStore.getState().status)

/**
 * Preview one action of a guide as the narrator would show it: the paragraph's position on
 * the study board, the action's cues, and its word lit in the text. Never while the narrator runs.
 */
export function previewGuideAction(hit: NonNullable<ReturnType<typeof chipAction>>, games: RecognizedGame[]): void {
  if (narratorRunning()) return
  const spot = locatePosition(games, hit.group.fen)
  if (spot) {
    const board = useStudyBoardStore.getState()
    if (board.activeGame !== spot.tree || board.currentNodeId !== spot.nodeId) {
      board.loadPosition(spot.tree, spot.nodeId, spot.nodeId !== null && !spot.tree.mainline.includes(spot.nodeId))
    }
  }
  useNarrationStore.setState({ cues: actionCues(hit.action) })
  setWordHighlight(wordRange(hit.group.textElement, hit.action.at))
}

/** The preview is over: the marks and the lit word go away (unless the narrator took the board). */
export function endGuidePreview(): void {
  setWordHighlight(null)
  if (!narratorRunning()) useNarrationStore.setState({ cues: [] })
}
