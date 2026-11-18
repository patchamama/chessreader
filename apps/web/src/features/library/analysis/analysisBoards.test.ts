import { beforeEach, describe, expect, it } from 'vitest'
import { useAnalysisBoards, openAnalysisBoard, closeAnalysisBoard } from './analysisBoards'

describe('several analysis boards (open a line or a book comment without losing the current board)', () => {
  beforeEach(() => useAnalysisBoards.setState({ boards: [], active: null }))

  it('opens boards side by side, activates the newest and closes them one by one', () => {
    const a = openAnalysisBoard({ title: 'Variation', startFen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1', moves: ['e4', 'e5'] })
    const b = openAnalysisBoard({ title: 'Book comment', pgn: '1. d4 d5 *', text: 'A quiet start.' })
    expect(useAnalysisBoards.getState().boards.map((x) => x.title)).toEqual(['Variation', 'Book comment'])
    expect(useAnalysisBoards.getState().active).toBe(b)
    closeAnalysisBoard(b)
    expect(useAnalysisBoards.getState().boards.map((x) => x.id)).toEqual([a])
    expect(useAnalysisBoards.getState().active).toBe(a)
  })
})
