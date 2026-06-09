import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import VariationTree from '../components/VariationTree'
import { buildGameTree, resetNodeCounter, tokenize } from '@chess-ebook/chess-shared'

const STANDARD_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'
const VARIATION_PGN = '1. e4 e5 (1... c5 2. Nc3) 2. Nf3'

function makeTree(pgn: string) {
  resetNodeCounter()
  return buildGameTree(tokenize(pgn), STANDARD_FEN)
}

describe('VariationTree', () => {
  const onEnterVariation = vi.fn()
  const onReturnToMainline = vi.fn()

  beforeEach(() => {
    onEnterVariation.mockClear()
    onReturnToMainline.mockClear()
  })

  it('renders nothing when tree has no variations', () => {
    const tree = makeTree('1. e4 e5')
    const { container } = render(
      <VariationTree
        tree={tree}
        activeNodeId={null}
        isInVariation={false}
        onEnterVariation={onEnterVariation}
        onReturnToMainline={onReturnToMainline}
      />
    )
    expect(container.firstChild).toBeNull()
  })

  it('renders variation moves as buttons', () => {
    const tree = makeTree(VARIATION_PGN)
    render(
      <VariationTree
        tree={tree}
        activeNodeId={null}
        isInVariation={false}
        onEnterVariation={onEnterVariation}
        onReturnToMainline={onReturnToMainline}
      />
    )
    // Should have buttons for variation moves (c5, Nc3)
    expect(screen.getByRole('button', { name: /c5/i })).toBeInTheDocument()
  })

  it('clicking a variation move calls onEnterVariation with that node id', async () => {
    const user = userEvent.setup()
    const tree = makeTree(VARIATION_PGN)
    render(
      <VariationTree
        tree={tree}
        activeNodeId={null}
        isInVariation={false}
        onEnterVariation={onEnterVariation}
        onReturnToMainline={onReturnToMainline}
      />
    )
    const varBtn = screen.getByRole('button', { name: /c5/i })
    const nodeId = varBtn.getAttribute('data-node-id')!
    await user.click(varBtn)
    expect(onEnterVariation).toHaveBeenCalledWith(nodeId)
  })

  it('shows return-to-mainline button when isInVariation is true', () => {
    const tree = makeTree(VARIATION_PGN)
    render(
      <VariationTree
        tree={tree}
        activeNodeId={null}
        isInVariation={true}
        onEnterVariation={onEnterVariation}
        onReturnToMainline={onReturnToMainline}
      />
    )
    expect(screen.getByRole('button', { name: /mainline/i })).toBeInTheDocument()
  })

  it('clicking return-to-mainline button calls onReturnToMainline', async () => {
    const user = userEvent.setup()
    const tree = makeTree(VARIATION_PGN)
    render(
      <VariationTree
        tree={tree}
        activeNodeId={null}
        isInVariation={true}
        onEnterVariation={onEnterVariation}
        onReturnToMainline={onReturnToMainline}
      />
    )
    await user.click(screen.getByRole('button', { name: /mainline/i }))
    expect(onReturnToMainline).toHaveBeenCalled()
  })
})
