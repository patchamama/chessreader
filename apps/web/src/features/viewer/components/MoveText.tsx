import type { RecognizedGame } from '@chess-ebook/chess-shared'
import { mainlineNodes } from '@chess-ebook/chess-shared'

interface MoveTextProps {
  fullText: string
  game: RecognizedGame
  activeNodeId: string | null
  onSelectNode: (nodeId: string) => void
}

/**
 * Renders the source text of a recognized game where each SAN move is
 * replaced with a clickable button. Uses the node's san and id from the mainline.
 */
export default function MoveText({ fullText, game, activeNodeId, onSelectNode }: MoveTextProps) {
  const nodes = mainlineNodes(game.tree)

  // Build segments: alternating text and button for each move token
  // We scan the fullText slice (charStart..charEnd) and find each SAN occurrence
  const text = fullText.slice(game.charStart, game.charEnd)
  const segments: React.ReactNode[] = []
  let cursor = 0

  for (const node of nodes) {
    // Find the SAN within the text after cursor
    const sanIdx = text.indexOf(node.san, cursor)
    if (sanIdx < 0) continue

    // Text before this move
    if (sanIdx > cursor) {
      segments.push(text.slice(cursor, sanIdx))
    }

    const isActive = node.id === activeNodeId
    segments.push(
      <button
        key={node.id}
        data-node-id={node.id}
        aria-current={isActive ? 'true' : undefined}
        className={`inline font-medium px-0.5 rounded hover:bg-yellow-200 focus:outline-none ${
          isActive ? 'bg-yellow-300 font-bold' : ''
        }`}
        onClick={() => onSelectNode(node.id)}
      >
        {node.san}
      </button>
    )

    cursor = sanIdx + node.san.length
  }

  // Remaining text
  if (cursor < text.length) {
    segments.push(text.slice(cursor))
  }

  return <span>{segments}</span>
}
