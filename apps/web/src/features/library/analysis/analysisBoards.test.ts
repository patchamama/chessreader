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

describe('registering boards of opened books and games', () => {
  beforeEach(() => useAnalysisBoards.setState({ boards: [], active: null, scratch: null }))

  it('adds a tab without selecting it and never duplicates its key', async () => {
    const { registerAnalysisBoard } = await import('./analysisBoards')
    const own = openAnalysisBoard({ title: 'Mine' })
    const a = registerAnalysisBoard({ title: 'Game 1', source: 'Book', moves: ['e4'], ply: 1 }, '7:1:0')
    const again = registerAnalysisBoard({ title: 'Game 1', source: 'Book', moves: ['e4', 'e5'], ply: 2 }, '7:1:0')
    expect(again).toBe(a)
    const s = useAnalysisBoards.getState()
    expect(s.active).toBe(own)
    expect(s.boards.map((b) => b.title)).toEqual(['Mine', 'Game 1'])
    expect(s.boards[1]).toMatchObject({ moves: ['e4', 'e5'], source: 'Book' })
  })

  it('keeps the work done on a registered tab and reopens a closed one', async () => {
    const { registerAnalysisBoard, updateAnalysisWork, closeAnalysisBoard } = await import('./analysisBoards')
    const id = registerAnalysisBoard({ title: 'G', moves: ['d4'] }, 'k')
    const work = { startFen: 'x', moves: ['d2d4'], ply: 1, text: '', flipped: false, boardHidden: false, layout: 'paragraphs' as const }
    updateAnalysisWork(id, work)
    registerAnalysisBoard({ title: 'G', moves: ['c4'] }, 'k')
    expect(useAnalysisBoards.getState().boards[0]).toMatchObject({ moves: ['d4'], work })
    closeAnalysisBoard(id)
    registerAnalysisBoard({ title: 'G' }, 'k')
    expect(useAnalysisBoards.getState().boards).toHaveLength(1)
  })

  it('caps registered tabs, dropping the oldest unmodified', async () => {
    const { registerAnalysisBoard, MAX_REGISTERED_BOARDS } = await import('./analysisBoards')
    for (let i = 0; i < MAX_REGISTERED_BOARDS + 3; i++) registerAnalysisBoard({ title: `G${i}` }, `k${i}`)
    const titles = useAnalysisBoards.getState().boards.map((b) => b.title)
    expect(titles).toHaveLength(MAX_REGISTERED_BOARDS)
    expect(titles[0]).toBe('G3')
  })
})
