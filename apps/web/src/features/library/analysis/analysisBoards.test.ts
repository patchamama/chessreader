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

describe('analysis tabs keep their work (S10)', () => {
  beforeEach(() => useAnalysisBoards.setState({ boards: [], active: null, scratch: null }))

  it('"+" opens a new empty board and what is played on it is kept', async () => {
    const { newAnalysisBoard, updateAnalysisWork } = await import('./analysisBoards')
    const id = newAnalysisBoard('Analysis 1')
    const board = useAnalysisBoards.getState().boards.find((b) => b.id === id)
    expect(board).toMatchObject({ title: 'Analysis 1' })
    expect(board?.moves).toBeUndefined()
    expect(useAnalysisBoards.getState().active).toBe(id)
    const work = { startFen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1', moves: ['e2e4'], ply: 1, text: '', flipped: false, boardHidden: false, layout: 'paragraphs' as const }
    updateAnalysisWork(id, work)
    expect(useAnalysisBoards.getState().boards.find((b) => b.id === id)?.work).toEqual(work)
  })
})
