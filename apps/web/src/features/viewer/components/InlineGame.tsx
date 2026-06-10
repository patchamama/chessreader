import { useState } from 'react'
import type { RecognizedGame } from '@chess-ebook/chess-shared'
import ChessBoard from '../../../shared/chess/ChessBoard'
import EvalBar from './EvalBar'
import EngineLines from './EngineLines'
import MoveText from './MoveText'
import VariationTree from './VariationTree'
import { useGameNavigation } from '../hooks/useGameNavigation'
import { useViewerStore } from '../store/viewerStore'
import { useSettingsStore } from '../../../shared/settings/settingsStore'

interface InlineGameProps {
  treeId: string
  game: RecognizedGame
  fullText: string
}

export default function InlineGame({ treeId, game, fullText }: InlineGameProps) {
  const orientation    = useViewerStore((s) => s.orientation)
  const isInVariation  = useViewerStore((s) => s.isInVariation[treeId] ?? false)
  const currentNodeId  = useViewerStore((s) => s.currentNodeId[treeId] ?? null)
  const evalDirection  = useSettingsStore((s) => s.evalBarDirection)
  const { fen, lastMove, selectNode, next, prev, enterVariation, returnToMainline } =
    useGameNavigation(treeId, game.tree)
  const { goToStart, flipOrientation, setActiveTree } = useViewerStore.getState()

  const [previewFen, setPreviewFen] = useState<string | null>(null)
  const displayFen = previewFen ?? fen

  const activateThis = () => setActiveTree(treeId)

  const navButtons = (
    <div className="flex gap-1">
      <button
        aria-label="Go to start"
        className="px-2 py-1 text-xs bg-gray-100 rounded hover:bg-gray-200"
        onClick={() => goToStart(treeId)}
      >⏮</button>
      <button
        aria-label="Previous move"
        className="px-2 py-1 text-xs bg-gray-100 rounded hover:bg-gray-200"
        onClick={prev}
      >◀</button>
      <button
        aria-label="Next move"
        className="px-2 py-1 text-xs bg-gray-100 rounded hover:bg-gray-200"
        onClick={next}
      >▶</button>
      <button
        aria-label="Flip board"
        className="px-2 py-1 text-xs bg-gray-100 rounded hover:bg-gray-200"
        onClick={flipOrientation}
      >⇅</button>
    </div>
  )

  const enginePanel = (
    <div className="bg-gray-900 rounded p-1.5">
      <EngineLines fen={fen} onPreviewFen={setPreviewFen} />
    </div>
  )

  return (
    <div className="my-4 flex flex-col gap-2">
      <div className="flex gap-4 items-start">

        {/* Left column: board area — click activates keyboard nav for this game */}
        <div
          role="region"
          aria-label="Chess board"
          className="shrink-0 w-52"
          onClick={activateThis}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') activateThis() }}
          tabIndex={0}
        >
          {evalDirection === 'vertical' ? (
            // Vertical eval bar sits left of the board
            <div className="flex gap-1 items-start">
              <EvalBar fen={displayFen} />
              <div className="flex-1 flex flex-col gap-1">
                <ChessBoard fen={displayFen} orientation={orientation} lastMove={lastMove} />
                {navButtons}
              </div>
            </div>
          ) : (
            // Horizontal eval bar goes below the board
            <div className="flex flex-col gap-1">
              <ChessBoard fen={displayFen} orientation={orientation} lastMove={lastMove} />
              {navButtons}
              <EvalBar fen={displayFen} />
            </div>
          )}
          {enginePanel}
        </div>

        {/* Right column: move text + variation tree */}
        <div className="flex-1">
          <MoveText
            fullText={fullText}
            game={game}
            activeNodeId={currentNodeId}
            onSelectNode={(id) => selectNode(id, false)}
          />
          <VariationTree
            tree={game.tree}
            activeNodeId={currentNodeId}
            isInVariation={isInVariation}
            onEnterVariation={enterVariation}
            onReturnToMainline={returnToMainline}
          />
        </div>
      </div>
    </div>
  )
}
