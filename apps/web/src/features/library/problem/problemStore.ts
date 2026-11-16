import { create } from 'zustand'
import type { GameTree } from '@chess-ebook/chess-shared'
import { useStudyBoardStore } from '../store/studyBoardStore'
import type { Problem } from './problems'

/**
 * Problem mode: the game is played on the board up to an important position,
 * then stops and asks for the move. A few attempts, hints on request, then the
 * move is shown and the game goes on to the next problem.
 */
export type ProblemPhase = 'idle' | 'playing' | 'solving' | 'solved' | 'revealed' | 'finished'
export const MAX_ATTEMPTS = 3

let runtime = { delay: (ms: number) => new Promise<void>((r) => setTimeout(r, ms)) }
export function setProblemRuntime(next: Partial<typeof runtime>) {
  runtime = { ...runtime, ...next }
}

interface ProblemState {
  tree: GameTree | null
  problems: Problem[]
  index: number
  phase: ProblemPhase
  attempts: number
  hintLevel: 0 | 1 | 2
  solved: number
  start: (tree: GameTree, problems: Problem[]) => void
  next: () => void
  hint: () => void
  reveal: () => void
  stop: () => void
}

let token = 0
const board = () => useStudyBoardStore.getState()
const same = (a: string, b: string) => a.split(' ').slice(0, 4).join(' ') === b.split(' ').slice(0, 4).join(' ')

export const useProblemStore = create<ProblemState>((set, get) => {
  /** Play the main line on the board from where it is up to the problem's position. */
  async function approach(index: number) {
    const my = ++token
    const { tree, problems } = get()
    if (!tree) return
    if (index >= problems.length) { set({ phase: 'finished' }); return }
    set({ index, phase: 'playing', attempts: 0, hintLevel: 0 })
    const target = tree.nodes.get(problems[index].nodeId)!.parentId
    const stopAt = target === null ? -1 : tree.mainline.indexOf(target)
    const current = board().activeGame === tree && board().currentNodeId ? tree.mainline.indexOf(board().currentNodeId!) : -1
    let from = current >= 0 && current <= stopAt ? current : -1
    if (from === -1) board().loadPosition(tree, null, false)
    while (from < stopAt) {
      await runtime.delay(650)
      if (my !== token) return
      from++
      board().loadPosition(tree, tree.mainline[from], false)
    }
    if (my === token) set({ phase: 'solving' })
  }

  return {
    tree: null, problems: [], index: 0, phase: 'idle', attempts: 0, hintLevel: 0, solved: 0,
    start: (tree, problems) => {
      set({ tree, problems, solved: 0 })
      board().loadPosition(tree, null, false)
      void approach(0)
    },
    next: () => void approach(get().index + 1),
    hint: () => set((s) => ({ hintLevel: Math.min(2, s.hintLevel + 1) as 0 | 1 | 2 })),
    reveal: () => {
      const { tree, problems, index, phase } = get()
      if (!tree || phase !== 'solving') return
      board().loadPosition(tree, problems[index].nodeId, false)
      set({ phase: 'revealed' })
    },
    stop: () => {
      token++
      set({ tree: null, problems: [], index: 0, phase: 'idle', attempts: 0, hintLevel: 0, solved: 0 })
    },
  }
})

// The user's move on the board answers the problem.
useStudyBoardStore.subscribe((s, prev) => {
  if (!s.playFen || s.playFen === prev.playFen) return
  const p = useProblemStore.getState()
  if (p.phase !== 'solving' || !p.tree) return
  const node = p.tree.nodes.get(p.problems[p.index].nodeId)
  if (!node) return
  if (same(s.playFen, node.fen)) {
    board().loadPosition(p.tree, node.id, false)
    useProblemStore.setState({ phase: 'solved', solved: p.solved + 1 })
  } else {
    const attempts = p.attempts + 1
    if (attempts >= MAX_ATTEMPTS) {
      board().loadPosition(p.tree, node.id, false)
      useProblemStore.setState({ phase: 'revealed', attempts })
    } else {
      board().resetPlay()
      useProblemStore.setState({ attempts })
    }
  }
})
