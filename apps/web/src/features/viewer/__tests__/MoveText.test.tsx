import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import MoveText from '../components/MoveText'
import { buildGameTree, resetNodeCounter, tokenize } from '@chess-ebook/chess-shared'
import type { RecognizedGame } from '@chess-ebook/chess-shared'

const STANDARD_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'
const PGN_TEXT = '1. e4 e5 2. Nf3 Nc6'

function makeRecognizedGame(text: string): RecognizedGame {
  resetNodeCounter()
  const tokens = tokenize(text)
  const tree = buildGameTree(tokens, STANDARD_FEN)
  return {
    charStart: 0,
    charEnd: text.length,
    source: text,
    tree,
  }
}

describe('MoveText', () => {
  const onSelectNode = vi.fn()

  beforeEach(() => {
    onSelectNode.mockClear()
  })

  it('renders buttons with data-node-id for each move', () => {
    const game = makeRecognizedGame(PGN_TEXT)
    render(
      <MoveText
        fullText={PGN_TEXT}
        game={game}
        activeNodeId={null}
        onSelectNode={onSelectNode}
      />
    )
    const buttons = screen.getAllByRole('button')
    // 4 move buttons: e4, e5, Nf3, Nc6
    expect(buttons.length).toBeGreaterThanOrEqual(4)
    buttons.forEach(btn => {
      expect(btn).toHaveAttribute('data-node-id')
    })
  })

  it('clicking a button calls onSelectNode with that node id', async () => {
    const user = userEvent.setup()
    const game = makeRecognizedGame(PGN_TEXT)
    render(
      <MoveText
        fullText={PGN_TEXT}
        game={game}
        activeNodeId={null}
        onSelectNode={onSelectNode}
      />
    )
    const firstBtn = screen.getAllByRole('button')[0]
    const nodeId = firstBtn.getAttribute('data-node-id')!
    await user.click(firstBtn)
    expect(onSelectNode).toHaveBeenCalledWith(nodeId)
  })

  it('active move button has an aria-current attribute', () => {
    const game = makeRecognizedGame(PGN_TEXT)
    const activeId = game.tree.mainline[0]
    render(
      <MoveText
        fullText={PGN_TEXT}
        game={game}
        activeNodeId={activeId}
        onSelectNode={onSelectNode}
      />
    )
    const activeBtn = screen.getByRole('button', { name: /e4/i })
    expect(activeBtn).toHaveAttribute('aria-current', 'true')
  })
})
