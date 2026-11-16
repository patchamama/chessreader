import { create } from 'zustand'
import { moveCue, detectLang } from '@chess-ebook/chess-shared'
import type { BoardCue, GameTree, Lang, NarrationStep } from '@chess-ebook/chess-shared'
import { useStudyBoardStore } from '../store/studyBoardStore'
import { browserSpeaker, type Speaker } from './speaker'

/**
 * Narration player. Walks a narration script step by step: it says each
 * sentence, puts the right position on the study board and publishes the board
 * cues of what is being said. Two ways to follow the moves:
 *  - 'auto':   each move is played on the board as it is announced;
 *  - 'manual': the move is announced and shown, and the narration waits until
 *              the user makes that move on the board.
 */
export type NarrationMode = 'auto' | 'manual'
export type NarrationStatus = 'idle' | 'playing' | 'paused' | 'waiting-move' | 'finished'

interface Runtime {
  speaker: Speaker
  delay: (ms: number) => Promise<void>
}
let runtime: Runtime = {
  speaker: browserSpeaker(),
  delay: (ms) => new Promise((r) => setTimeout(r, ms)),
}
/** Swap the speaker/timer (tests, or another output device). */
export function setNarrationRuntime(next: Partial<Runtime>) {
  runtime = { ...runtime, ...next }
}

interface NarrationState {
  script: NarrationStep[]
  tree: GameTree | null
  lang: Lang
  stepIndex: number
  status: NarrationStatus
  mode: NarrationMode
  /** Play the variations a comment quotes on the board while it is read. */
  simulate: boolean
  rate: number
  /** What the board shows for the sentence being said. */
  cues: BoardCue[]
  /** The sentence being said, as written in the book. */
  caption: string
  /** 'manual' mode: the move the narration is waiting for. */
  expected: { from: string; to: string; nodeId: string } | null
  wrongAttempts: number
  /** Glossary concepts mentioned so far, in order of appearance. */
  concepts: string[]

  load: (script: NarrationStep[], tree: GameTree) => void
  play: () => void
  pause: () => void
  stop: () => void
  goTo: (stepIndex: number) => void
  setOption: (o: Partial<Pick<NarrationState, 'mode' | 'simulate' | 'rate'>>) => void
}

/** Bumped to cancel the running loop (pause, stop, jump, reload). */
let runToken = 0
let moveWaiter: (() => void) | null = null

const board = () => useStudyBoardStore.getState()
const show = (tree: GameTree, nodeId: string | null) =>
  board().loadPosition(tree, nodeId, nodeId !== null && !tree.mainline.includes(nodeId))

export const useNarrationStore = create<NarrationState>((set, get) => {
  const addConcepts = (cues: BoardCue[]) => {
    const fresh = cues.map((c) => c.concept).filter((c): c is string => !!c && !get().concepts.includes(c))
    if (fresh.length) set({ concepts: [...get().concepts, ...new Set(fresh)] })
  }

  async function run(token: number) {
    const alive = () => token === runToken
    const { tree, script } = get()
    if (!tree) return
    while (alive() && get().stepIndex < script.length) {
      const step = script[get().stepIndex]
      const { lang, rate, mode, simulate } = get()

      if (step.kind === 'move') {
        const node = tree.nodes.get(step.nodeId!)!
        const sentence = step.sentences[0]
        if (mode === 'manual') {
          // Announce and show the move on the position before it, then wait.
          show(tree, node.parentId)
          set({ cues: sentence.cues, caption: step.speech, status: 'playing' })
          await runtime.speaker.speak(step.speech, lang, rate)
          if (!alive()) return
          set({ status: 'waiting-move', expected: { from: node.from, to: node.to, nodeId: node.id }, wrongAttempts: 0 })
          await new Promise<void>((resolve) => { moveWaiter = resolve })
          moveWaiter = null
          if (!alive()) return
          set({ status: 'playing', expected: null })
          show(tree, node.id)
        } else {
          show(tree, node.id)
          set({ cues: sentence.cues, caption: step.speech })
          await runtime.speaker.speak(step.speech, lang, rate)
          if (!alive()) return
        }
        addConcepts(sentence.cues)
      } else {
        show(tree, step.nodeId)
        for (const sentence of step.sentences) {
          set({ cues: sentence.cues, caption: sentence.text })
          addConcepts(sentence.cues)
          await runtime.speaker.speak(sentence.speech, lang, rate)
          if (!alive()) return
          if (simulate && sentence.moves.length > 0) {
            // Play the quoted line on the board, move by move, then go back.
            for (const id of sentence.moves) {
              const v = tree.nodes.get(id)
              if (!v) continue
              show(tree, id)
              set({ cues: [moveCue({ san: v.san, from: v.from, to: v.to, fen: v.fen })] })
              await runtime.delay(1100 / rate)
              if (!alive()) return
            }
            show(tree, step.nodeId)
            set({ cues: [] })
            await runtime.delay(500 / rate)
            if (!alive()) return
          }
        }
      }
      set({ stepIndex: get().stepIndex + 1 })
    }
    if (alive()) set({ status: 'finished', cues: [], caption: '', expected: null })
  }

  const halt = () => {
    runToken++
    runtime.speaker.cancel()
    const w = moveWaiter
    moveWaiter = null
    w?.()
  }

  return {
    script: [],
    tree: null,
    lang: 'es',
    stepIndex: 0,
    status: 'idle',
    mode: 'auto',
    simulate: true,
    rate: 1,
    cues: [],
    caption: '',
    expected: null,
    wrongAttempts: 0,
    concepts: [],

    load: (script, tree) => {
      halt()
      set({
        script, tree, stepIndex: 0, status: 'idle', cues: [], caption: '', expected: null, wrongAttempts: 0,
        concepts: [], lang: detectLang(script.map((s) => s.sentences.map((x) => x.text).join(' ')).join(' ')),
      })
    },
    play: () => {
      const s = get()
      if (!s.tree || s.script.length === 0 || s.status === 'playing' || s.status === 'waiting-move') return
      halt()
      set({ status: 'playing', stepIndex: s.status === 'finished' ? 0 : s.stepIndex, expected: null })
      void run(runToken)
    },
    pause: () => {
      if (get().status !== 'playing' && get().status !== 'waiting-move') return
      halt()
      set({ status: 'paused', expected: null })
    },
    stop: () => {
      halt()
      set({ status: 'idle', stepIndex: 0, cues: [], caption: '', expected: null, wrongAttempts: 0 })
    },
    goTo: (stepIndex) => {
      const { script, tree, status } = get()
      if (!tree || script.length === 0) return
      const index = Math.max(0, Math.min(script.length - 1, stepIndex))
      const resume = status === 'playing' || status === 'waiting-move'
      halt()
      const step = script[index]
      show(tree, step.kind === 'move' && get().mode === 'manual' ? tree.nodes.get(step.nodeId!)!.parentId : step.nodeId)
      set({
        stepIndex: index, cues: step.sentences[0].cues, expected: null,
        caption: step.kind === 'move' ? step.speech : step.sentences[0].text,
        status: resume ? 'playing' : 'paused',
      })
      if (resume) void run(runToken)
    },
    setOption: (o) => set(o),
  }
})

// 'manual' mode: the user's move on the study board answers the narration.
// Free play sets `playFen`; compare it with the position the announced move
// leads to (piece placement, side to move, castling, en passant).
const samePosition = (a: string, b: string) => a.split(' ').slice(0, 4).join(' ') === b.split(' ').slice(0, 4).join(' ')
useStudyBoardStore.subscribe((s, prev) => {
  if (!s.playFen || s.playFen === prev.playFen) return
  const n = useNarrationStore.getState()
  if (n.status !== 'waiting-move' || !n.expected || !n.tree) return
  const node = n.tree.nodes.get(n.expected.nodeId)
  if (node && samePosition(s.playFen, node.fen)) {
    const w = moveWaiter
    moveWaiter = null
    w?.()
  } else {
    useStudyBoardStore.getState().resetPlay()
    useNarrationStore.setState({ wrongAttempts: n.wrongAttempts + 1 })
  }
})
