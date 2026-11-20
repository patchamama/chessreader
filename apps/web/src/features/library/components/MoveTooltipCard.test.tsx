import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { recognizeGames } from '@chess-ebook/chess-shared'
import { MoveTooltipCard } from './MoveTooltipCard'
import { setReviewEngine, useReviewStore } from '../review/reviewStore'
import { useSettingsStore } from '../../../shared/settings/settingsStore'

vi.mock('../../../shared/chess/ChessBoard', () => ({ default: ({ fen }: { fen: string }) => <div data-testid="thumb">{fen}</div> }))

const [game] = recognizeGames('1. e4 e5 2. Qh5 Nc6 3. Bc4 Nf6 4. Qxf7#', { algorithm: 2 })
const tree = game.tree
const nf6 = tree.nodes.get(tree.mainline[5])!
const bc4 = tree.nodes.get(tree.mainline[4])!

beforeEach(() => {
  useSettingsStore.getState().reset()
  useSettingsStore.setState({ language: 'en' })
  useReviewStore.setState({ byTree: new Map(), records: [] })
  setReviewEngine(null)
})

describe('MoveTooltipCard (S10)', () => {
  it('shows the evaluation before and after the move, how much it lost, and the move the engine wanted as a dashed arrow', () => {
    useReviewStore.setState({ byTree: new Map([[tree, { review: { moves: [] } as never, plies: [{
      nodeId: nf6.id, san: 'Nf6', color: 'black', moveNumber: 3, from: 'g8', to: 'f6', fenBefore: bc4.fen, fenAfter: nf6.fen,
      before: { cp: 30 }, after: { mate: 1 }, best: { san: 'g6', line: ['g6', 'Qf3'] },
    }] }]]) })
    render(<MoveTooltipCard tree={tree} node={nf6} fen={nf6.fen} lastMove={{ from: 'g8', to: 'f6' }} />)
    expect(screen.getByTestId('hint-eval')).toHaveTextContent('+0.3 → #1')
    expect(screen.getByTestId('hint-eval')).toHaveTextContent('−')
    expect(screen.getByTestId('hint-best')).toHaveTextContent('Engine: 3... g6')
    const arrow = screen.getByTestId('best-arrow')
    expect(arrow.getAttribute('stroke-dasharray')).toBeTruthy()
    expect(arrow.dataset.move).toBe('g7g6')
  })

  it('without a review, asks the engine about the position before and after', async () => {
    const asked: string[] = []
    setReviewEngine(async (fen) => {
      asked.push(fen)
      return fen === bc4.fen ? [{ idx: 1, depth: 10, scoreCp: -30, pv: ['g7g6'] }] : [{ idx: 1, depth: 10, mate: 1, pv: ['h5f7'] }]
    })
    render(<MoveTooltipCard tree={tree} node={nf6} fen={nf6.fen} lastMove={{ from: 'g8', to: 'f6' }} />)
    await waitFor(() => expect(screen.getByTestId('hint-eval')).toHaveTextContent('+0.3 → #1'))
    expect(asked).toEqual([bc4.fen, nf6.fen])
  })

  it('the best move played gets no arrow', () => {
    useReviewStore.setState({ byTree: new Map([[tree, { review: { moves: [] } as never, plies: [{
      nodeId: bc4.id, san: 'Bc4', color: 'white', moveNumber: 3, from: 'f1', to: 'c4', fenBefore: tree.nodes.get(tree.mainline[3])!.fen, fenAfter: bc4.fen,
      before: { cp: 30 }, after: { cp: 30 }, best: { san: 'Bc4', line: ['Bc4'] },
    }] }]]) })
    render(<MoveTooltipCard tree={tree} node={bc4} fen={bc4.fen} lastMove={{ from: 'f1', to: 'c4' }} />)
    expect(screen.queryByTestId('best-arrow')).toBeNull()
    expect(screen.getByTestId('hint-best')).toHaveTextContent('the engine’s move')
  })

  it('can be switched off in Settings', () => {
    useSettingsStore.setState({ hintEval: false })
    render(<MoveTooltipCard tree={tree} node={nf6} fen={nf6.fen} lastMove={null} />)
    expect(screen.queryByTestId('hint-eval')).toBeNull()
  })
})

describe('MoveTooltipCard shows the piece a capture took (llm-assistant-round S13)', () => {
  it('a capture shows the taken piece; a quiet move shows none', () => {
    const qxf7 = tree.nodes.get(tree.mainline[6])!
    const { unmount } = render(<MoveTooltipCard tree={tree} node={qxf7} fen={qxf7.fen} lastMove={{ from: 'h5', to: 'f7' }} />)
    expect(screen.getByTestId('captured-piece')).toHaveTextContent('♟')
    unmount()
    render(<MoveTooltipCard tree={tree} node={bc4} fen={bc4.fen} lastMove={{ from: 'f1', to: 'c4' }} />)
    expect(screen.queryByTestId('captured-piece')).toBeNull()
  })
})
