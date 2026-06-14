import { describe, it, expect, beforeEach } from 'vitest'
import { recognizeGames } from '@chess-ebook/chess-shared'
import { useStudyBoardStore } from './studyBoardStore'

const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'
const reset = () => useStudyBoardStore.getState().reset()

describe('studyBoardStore — playable board', () => {
  beforeEach(reset)

  it('selects a piece and exposes its legal targets', () => {
    useStudyBoardStore.getState().selectSquare('e2', START)
    const s = useStudyBoardStore.getState()
    expect(s.selectedSquare).toBe('e2')
    expect(s.legalTargets).toContain('e4')
    expect(s.legalTargets).toContain('e3')
  })

  it('does not select an empty square or the wrong colour', () => {
    useStudyBoardStore.getState().selectSquare('e4', START) // empty
    expect(useStudyBoardStore.getState().selectedSquare).toBeNull()
    useStudyBoardStore.getState().selectSquare('e7', START) // black, but white to move
    expect(useStudyBoardStore.getState().selectedSquare).toBeNull()
  })

  it('plays a move when a target square is clicked after selecting', () => {
    const store = useStudyBoardStore.getState()
    store.selectSquare('e2', START)
    store.selectSquare('e4', START) // e4 is a legal target → move
    const s = useStudyBoardStore.getState()
    expect(s.playFen).toMatch(/4P3/) // pawn on e4
    expect(s.playFen!.split(' ')[1]).toBe('b') // black to move now
    expect(s.selectedSquare).toBeNull()
    expect(s.legalTargets).toEqual([])
  })

  it('lets both colours move (continues from playFen)', () => {
    const store = useStudyBoardStore.getState()
    store.selectSquare('e2', START)
    store.selectSquare('e4', START) // 1. e4
    const afterE4 = useStudyBoardStore.getState().playFen!
    // Now black to move; select e7 should work from the played position.
    store.selectSquare('e7', afterE4)
    expect(useStudyBoardStore.getState().selectedSquare).toBe('e7')
    store.selectSquare('e5', afterE4) // 1... e5
    expect(useStudyBoardStore.getState().playFen).toMatch(/4p3/)
  })

  it('playMove (drag) makes a legal move and rejects illegal ones', () => {
    const store = useStudyBoardStore.getState()
    expect(store.playMove('e2', 'e4', START)).toBe(true)
    expect(useStudyBoardStore.getState().playFen).toMatch(/4P3/)
    // illegal from the new position
    expect(useStudyBoardStore.getState().playMove('e4', 'e7', useStudyBoardStore.getState().playFen!)).toBe(false)
  })

  it('resetPlay clears the played position and selection', () => {
    const store = useStudyBoardStore.getState()
    store.selectSquare('e2', START)
    store.selectSquare('e4', START)
    store.resetPlay()
    const s = useStudyBoardStore.getState()
    expect(s.playFen).toBeNull()
    expect(s.selectedSquare).toBeNull()
    expect(s.legalTargets).toEqual([])
  })

  it('navigation resets the played position', () => {
    const tree = recognizeGames('1. e4 e5 2. Nf3 Nc6')[0].tree
    const store = useStudyBoardStore.getState()
    store.loadPosition(tree, tree.mainline[0], false)
    store.selectSquare('e7', tree.nodes.get(tree.mainline[0])!.fen) // black to move after 1.e4
    store.selectSquare('e5', tree.nodes.get(tree.mainline[0])!.fen)
    expect(useStudyBoardStore.getState().playFen).not.toBeNull()
    // navigating discards the free-play position
    store.setCurrentNode(tree.mainline[1], false)
    expect(useStudyBoardStore.getState().playFen).toBeNull()
  })
})
