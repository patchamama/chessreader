import { useState } from 'react'
import type { RecognizedGame } from '@chess-ebook/chess-shared'
import ChessBoard from '../../../shared/chess/ChessBoard'
import EvalBar from './EvalBar'
import EngineLines from './EngineLines'
import MoveText from './MoveText'
import VariationTree from './VariationTree'
import { useGameNavigation } from '../hooks/useGameNavigation'
import { useViewerStore } from '../store/viewerStore'

interface InlineGameProps {
  treeId: string
  game: RecognizedGame
  fullText: string
}

export default function InlineGame({ treeId, game, fullText }: InlineGameProps) {
  const orientation    = useViewerStore((s) => s.orientation)
  const isInVariation  = useViewerStore((s) => s.isInVariation[treeId] ?? false)
  const currentNodeId  = useViewerStore((s) => s.currentNodeId[treeId] ?? null)
  const { fen, lastMove, selectNode, next, prev, enterVariation, returnToMainline } =
    useGameNavigation(treeId, game.tree)
  const { goToStart, flipOrientation } = useViewerStore.getState()

  // Preview FEN from engine-lines hover (null = show actual game fen)
  const [previewFen, setPreviewFen] = useState<string | null>(null)
  const displayFen = previewFen ?? fen

  return (
    <div className="my-4 flex flex-col gap-2">
      <div className="flex gap-4 items-start">

        {/* Left column: board + eval bar + engine lines */}
        <div className="shrink-0 w-52 flex flex-col gap-1">

          {/* Board */}
          <ChessBoard fen={displayFen} orientation={orientation} lastMove={lastMove} />

          {/* Nav controls */}
          <div className="flex gap-1">
            <button
              aria-label="Go to start"
              className="px-2 py-1 text-xs bg-gray-100 rounded hover:bg-gray-200"
              onClick={() => goToStart(treeId)}
            >
              ⏮
            </button>
            <button
              aria-label="Previous move"
              className="px-2 py-1 text-xs bg-gray-100 rounded hover:bg-gray-200"
              onClick={prev}
            >
              ◀
            </button>
            <button
              aria-label="Next move"
              className="px-2 py-1 text-xs bg-gray-100 rounded hover:bg-gray-200"
              onClick={next}
            >
              ▶
            </button>
            <button
              aria-label="Flip board"
              className="px-2 py-1 text-xs bg-gray-100 rounded hover:bg-gray-200"
              onClick={flipOrientation}
            >
              ⇅
            </button>
          </div>

          {/* Eval bar (horizontal) */}
          <EvalBar fen={displayFen} />

          {/* Engine lines */}
          <div className="bg-gray-900 rounded p-1.5">
            <EngineLines fen={fen} onPreviewFen={setPreviewFen} />
          </div>
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
