import { describe, it, expect, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { recognizeGames } from '@chess-ebook/chess-shared'
import { useStudyNavigation } from './useStudyNavigation'
import { useStudyBoardStore } from '../store/studyBoardStore'

const tree = () =>
  recognizeGames('1. e4 e5 2. Nf3 Nc6 3. Bb5 (3. Bc4 Bc5) a6 4. Ba4')[0].tree

beforeEach(() => useStudyBoardStore.getState().reset())

function load(nodeIndex: number | null) {
  const t = tree()
  const id = nodeIndex === null ? null : t.mainline[nodeIndex]
  act(() => useStudyBoardStore.getState().loadPosition(t, id, false))
  return t
}

describe('useStudyNavigation', () => {
  it('reports the current fen and node', () => {
    const t = load(0) // after e4
    const { result } = renderHook(() => useStudyNavigation())
    expect(result.current.node?.san).toBe('e4')
    expect(result.current.fen).toBe(t.nodes.get(t.mainline[0])!.fen)
  })

  it('next advances along the mainline', () => {
    load(0)
    const { result } = renderHook(() => useStudyNavigation())
    act(() => result.current.next())
    expect(useStudyBoardStore.getState().currentNodeId).toBe(tree().mainline[1])
  })

  it('prev steps back; goStart returns to start position', () => {
    load(2)
    const { result } = renderHook(() => useStudyNavigation())
    act(() => result.current.prev())
    expect(useStudyBoardStore.getState().currentNodeId).toBe(tree().mainline[1])
    act(() => result.current.goStart())
    expect(useStudyBoardStore.getState().currentNodeId).toBeNull()
  })

  it('detects a choice ahead at a branch point', () => {
    // mainline index 3 = Nc6; its successor Bb5 has a variation
    load(3)
    const { result } = renderHook(() => useStudyNavigation())
    expect(result.current.hasChoiceAhead).toBe(true)
    expect(result.current.siblingLines.length).toBeGreaterThan(0)
  })

  it('enterLine jumps into a variation line', () => {
    const t = load(3) // at Nc6
    const { result } = renderHook(() => useStudyNavigation())
    act(() => result.current.enterLine(0)) // first variation: Bc4...
    const cur = useStudyBoardStore.getState().currentNodeId
    expect(t.nodes.get(cur!)!.san).toBe('Bc4')
    expect(useStudyBoardStore.getState().isInVariation).toBe(true)
  })

  it('no choice ahead on a plain mainline node', () => {
    load(0) // e4 -> e5, no variation
    const { result } = renderHook(() => useStudyNavigation())
    expect(result.current.hasChoiceAhead).toBe(false)
  })
})
