import { describe, it, expect, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { recognizeGames } from '@chess-ebook/chess-shared'
import { useMoveHints, nodeQuality } from './useMoveHints'
import { setReviewEngine, useReviewStore } from './reviewStore'

const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'

describe('useMoveHints', () => {
  let calls = 0
  beforeEach(() => {
    calls = 0
    setReviewEngine(async () => {
      calls++
      return [
        { idx: 1, depth: 8, scoreCp: 40, pv: ['e2e4'] },
        { idx: 2, depth: 8, scoreCp: 30, pv: ['g1f3'] },
        { idx: 3, depth: 8, scoreCp: -400, pv: ['g1h3'] },
      ]
    })
  })

  it('grades the destinations of the selected piece, asking the engine once per position', async () => {
    const { result, rerender } = renderHook(({ sq }) => useMoveHints(START, sq, true), { initialProps: { sq: 'g1' as string | null } })
    await waitFor(() => expect(result.current).toEqual({ f3: 'good', h3: 'bad' }))
    rerender({ sq: 'e2' })
    await waitFor(() => expect(result.current).toEqual({ e4: 'good' }))
    expect(calls).toBe(1)
  })

  it('gives nothing when switched off or with no piece selected', () => {
    expect(renderHook(() => useMoveHints(START, 'g1', false)).result.current).toEqual({})
    expect(renderHook(() => useMoveHints(START, null, true)).result.current).toEqual({})
  })
})

describe('nodeQuality', () => {
  const [game] = recognizeGames('1. e4! e5?? 2. Nf3 Nc6', { algorithm: 2 })
  const [e4, e5, nf3] = game.tree.mainline.map((id) => game.tree.nodes.get(id)!)
  beforeEach(() => useReviewStore.setState({ byTree: new Map() }))

  it('reads the mark the text gives a move', () => {
    expect(nodeQuality(game.tree, e4)).toBe('good')
    expect(nodeQuality(game.tree, e5)).toBe('blunder')
    expect(nodeQuality(game.tree, nf3)).toBeUndefined()
  })
  it('falls back to the engine review when the text says nothing', () => {
    const review = { moves: [{ nodeId: nf3.id, quality: 'mistake' }] }
    useReviewStore.setState({ byTree: new Map([[game.tree, { plies: [], review }]]) as never })
    expect(nodeQuality(game.tree, nf3)).toBe('mistake')
    expect(nodeQuality(game.tree, e4)).toBe('good')
  })
})
