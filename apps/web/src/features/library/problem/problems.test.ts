import { describe, it, expect, beforeEach } from 'vitest'
import { recognizeGames } from '@chess-ebook/chess-shared'
import { findProblems, hintFor } from './problems'
import { useProblemStore, setProblemRuntime } from './problemStore'
import { useStudyBoardStore } from '../store/studyBoardStore'

const TEXT = [
  '1. e4 e5 2. Nf3 d6 3. d4 Bg4 4. dxe5 Bxf3 5. Qxf3 dxe5 6. Bc4 Nf6 7. Qb3! Qe7',
  'A long remark about why the double attack on b7 and f7 decides the opening: Black cannot defend both pawns and must give something back at once.',
  '8. Nc3 c6 9. Bg5 b5 10. Nxb5!! cxb5 (10... Qb4+ 11. Nc3) 11. Bxb5+ Nbd7',
].join('\n')
const [game] = recognizeGames(TEXT, { algorithm: 2 })
const san = (id: string) => game.tree.nodes.get(id)!.san

describe('findProblems', () => {
  const problems = findProblems(TEXT, game)
  it('picks the moves the text marks as strong, with their reason', () => {
    expect(problems.map((p) => san(p.nodeId))).toEqual(['Qb3', 'Nxb5'])
    expect(problems[0].reason).toBe('marked')
  })
  it('adds the turning points an engine review found, in game order', () => {
    const nc3 = game.tree.mainline[14]
    const withReview = findProblems(TEXT, game, [{ nodeId: nc3, quality: 'good' }, { nodeId: game.tree.mainline[1], quality: 'blunder' }])
    expect(withReview.map((p) => san(p.nodeId))).toEqual(['Qb3', 'Nc3', 'Nxb5'])
  })
  it('gives hints that get more specific', () => {
    const node = game.tree.nodes.get(problems[1].nodeId)!
    expect(hintFor(game.tree, node, 1, 'en')).toBe('Move a knight.')
    expect(hintFor(game.tree, node, 2, 'en')).toBe('Move the knight on c3.')
    expect(hintFor(game.tree, node, 1, 'es')).toBe('Mueve un caballo.')
    expect(hintFor(game.tree, node, 2, 'de')).toBe('Ziehe den Springer auf c3.')
  })
})

describe('problem mode', () => {
  const problems = findProblems(TEXT, game)
  const flush = () => new Promise((r) => setTimeout(r, 0))
  const settle = async (until: () => boolean) => { for (let i = 0; i < 200 && !until(); i++) await flush() }
  beforeEach(() => {
    useStudyBoardStore.getState().reset()
    setProblemRuntime({ delay: async () => {} })
    useProblemStore.getState().stop()
  })

  it('plays the game up to the position of the first problem and waits there', async () => {
    useProblemStore.getState().start(game.tree, problems)
    await settle(() => useProblemStore.getState().phase === 'solving')
    const before = game.tree.nodes.get(problems[0].nodeId)!.parentId
    expect(useStudyBoardStore.getState().currentNodeId).toBe(before)
    expect(useProblemStore.getState().index).toBe(0)
  })

  it('a wrong move costs an attempt and is taken back; the right move solves it', async () => {
    useProblemStore.getState().start(game.tree, problems)
    await settle(() => useProblemStore.getState().phase === 'solving')
    const base = game.tree.nodes.get(game.tree.nodes.get(problems[0].nodeId)!.parentId!)!.fen
    useStudyBoardStore.getState().playMove('a2', 'a3', base)
    expect(useProblemStore.getState().attempts).toBe(1)
    expect(useStudyBoardStore.getState().playFen).toBeNull()
    expect(useProblemStore.getState().phase).toBe('solving')
    useStudyBoardStore.getState().playMove('f3', 'b3', base)
    expect(useProblemStore.getState().phase).toBe('solved')
    expect(useProblemStore.getState().solved).toBe(1)
    expect(useStudyBoardStore.getState().currentNodeId).toBe(problems[0].nodeId)
  })

  it('reveals the move after three wrong attempts, and goes on to the next problem', async () => {
    useProblemStore.getState().start(game.tree, problems)
    await settle(() => useProblemStore.getState().phase === 'solving')
    const base = game.tree.nodes.get(game.tree.nodes.get(problems[0].nodeId)!.parentId!)!.fen
    for (const from of ['a2', 'h2', 'g2']) useStudyBoardStore.getState().playMove(from, `${from[0]}3`, base)
    expect(useProblemStore.getState().phase).toBe('revealed')
    expect(useStudyBoardStore.getState().currentNodeId).toBe(problems[0].nodeId)
    useProblemStore.getState().next()
    await settle(() => useProblemStore.getState().phase === 'solving')
    expect(useProblemStore.getState().index).toBe(1)
    useProblemStore.getState().next()
    await settle(() => useProblemStore.getState().phase === 'finished')
    expect(useProblemStore.getState().phase).toBe('finished')
  })

  it('a hint raises the hint level up to two', async () => {
    useProblemStore.getState().start(game.tree, problems)
    await settle(() => useProblemStore.getState().phase === 'solving')
    useProblemStore.getState().hint()
    useProblemStore.getState().hint()
    useProblemStore.getState().hint()
    expect(useProblemStore.getState().hintLevel).toBe(2)
  })
})
