import type { GameTree } from '@chess-ebook/chess-shared'

interface VariationTreeProps {
  tree: GameTree
  activeNodeId: string | null
  isInVariation: boolean
  onEnterVariation: (nodeId: string) => void
  onReturnToMainline: () => void
}

export default function VariationTree({
  tree,
  activeNodeId,
  isInVariation,
  onEnterVariation,
  onReturnToMainline,
}: VariationTreeProps) {
  if (tree.variations.size === 0 && !isInVariation) return null

  const allVariationLines: { parentId: string; line: string[] }[] = []
  for (const [parentId, lines] of tree.variations.entries()) {
    for (const line of lines) {
      allVariationLines.push({ parentId, line })
    }
  }

  if (allVariationLines.length === 0 && !isInVariation) return null

  return (
    <div className="text-sm text-gray-600 mt-1">
      {isInVariation && (
        <button
          className="mr-2 underline text-blue-600 hover:text-blue-800"
          onClick={onReturnToMainline}
        >
          ← Return to mainline
        </button>
      )}
      {allVariationLines.map(({ parentId, line }, lineIdx) => (
        <span key={`${parentId}-${lineIdx}`} className="mr-2">
          {'('}
          {line.map((nodeId) => {
            const node = tree.nodes.get(nodeId)
            if (!node) return null
            const isActive = nodeId === activeNodeId
            return (
              <button
                key={nodeId}
                data-node-id={nodeId}
                aria-current={isActive ? 'true' : undefined}
                className={`mx-0.5 px-0.5 rounded hover:bg-yellow-100 ${
                  isActive ? 'bg-yellow-200 font-bold' : ''
                }`}
                onClick={() => onEnterVariation(nodeId)}
              >
                {node.san}
              </button>
            )
          })}
          {')'}
        </span>
      ))}
    </div>
  )
}
