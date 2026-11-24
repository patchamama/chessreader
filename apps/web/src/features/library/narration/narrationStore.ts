import { create } from 'zustand'
import { useSettingsStore } from '../../../shared/settings/settingsStore'
import { moveCue, detectLang, sanToSpeech, variationIntro, backToGame, RETURN_PAUSE } from '@chess-ebook/chess-shared'
import { planSentence, type SentencePlan } from './sentencePlan'
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
  /** Wait used to repeat an announcement nobody answered. */
  timeout: (ms: number) => Promise<void>
}
let runtime: Runtime = {
  speaker: browserSpeaker(),
  delay: (ms) => new Promise((r) => setTimeout(r, ms)),
  timeout: (ms) => new Promise((r) => setTimeout(r, ms)),
}
/** Swap the speaker/timer (tests, or another output device). */
export function setNarrationRuntime(next: Partial<Runtime>) {
  runtime = { ...runtime, ...next }
}

export type ActionsSource = (commentText: string, fen: string) => string | undefined | Promise<string | undefined>

/** Time one word takes to be said at normal speed (about 150 words a minute). */
const WORD_MS = 400

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
  /** 'manual' mode: the board is not where the narration is — the squares that
   *  differ from the expected position, and that position. */
  mismatch: { squares: string[]; expectedFen: string } | null
  /** 'manual' mode: seconds without the move before the announcement is repeated (0 = never). */
  repeatAfter: number
  /** Glossary concepts mentioned so far, in order of appearance. */
  concepts: string[]

  /**
   * Where the narration action list of a comment comes from (the comments database): given the
   * comment as one text and the position it is about. Null = none (the moves written in the text are read instead).
   */
  actionsFor: ActionsSource | null
  setActionsFor: (source: ActionsSource | null) => void

  load: (script: NarrationStep[], tree: GameTree, lang?: Lang) => void
  /** Drop the pieces moved by hand and show the position the narration expects. */
  restorePosition: () => void
  play: () => void
  pause: () => void
  stop: () => void
  goTo: (stepIndex: number) => void
  setOption: (o: Partial<Pick<NarrationState, 'mode' | 'simulate' | 'rate' | 'repeatAfter'>>) => void
}

let introCount = 0

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

  /** Say a sentence while its marks appear as the narrator reaches their words. */
  async function say(speech: string, lang: Lang, rate: number, plan: SentencePlan, alive: () => boolean) {
    set({ cues: plan.base })
    const speaking = runtime.speaker.speak(speech, lang, rate)
    let shown = plan.base
    let elapsed = 0
    for (const reveal of plan.reveals) {
      const due = (reveal.at * WORD_MS) / rate
      if (due > elapsed) {
        await Promise.race([runtime.delay(due - elapsed), speaking])
        elapsed = due
      }
      if (!alive()) return
      shown = [...(reveal.clear ? [] : shown), ...reveal.cues]
      set({ cues: shown })
    }
    await speaking
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
          set({ cues: sentence.cues, caption: step.caption, status: 'playing', mismatch: null })
          await runtime.speaker.speak(step.speech, lang, rate)
          if (!alive()) return
          let moved = false
          const waitMove = new Promise<void>((resolve) => { moveWaiter = () => { moved = true; resolve() } })
          set({ status: 'waiting-move', expected: { from: node.from, to: node.to, nodeId: node.id }, wrongAttempts: 0 })
          // The move may already be on the board (made while it was announced).
          const played = board().playFen
          if (played && samePosition(played, node.fen)) moved = true
          else if (played) set({ mismatch: { squares: diffSquares(played, node.fen), expectedFen: node.fen } })
          while (!moved && alive()) {
            const repeat = get().repeatAfter
            await Promise.race([waitMove, repeat > 0 ? runtime.timeout(repeat * 1000) : new Promise<void>(() => {})])
            if (moved || !alive()) break
            // Nobody moved: say it and light it again.
            set({ cues: sentence.cues, caption: step.caption })
            await runtime.speaker.speak(step.speech, lang, rate)
          }
          moveWaiter = null
          if (!alive()) return
          set({ status: 'playing', expected: null, mismatch: null })
          show(tree, node.id)
        } else {
          show(tree, node.id)
          set({ cues: sentence.cues, caption: step.caption })
          await runtime.speaker.speak(step.speech, lang, rate)
          if (!alive()) return
          // The silence chosen in the settings after every game move (S32).
          const pause = useSettingsStore.getState().narrationMovePause
          if (pause > 0) {
            await runtime.delay(pause * 1000)
            if (!alive()) return
          }
        }
        addConcepts(sentence.cues)
      } else {
        show(tree, step.nodeId)
        const texts = step.sentences.map((x) => x.text)
        const fen = (step.nodeId ? tree.nodes.get(step.nodeId)?.fen : tree.startFen) ?? null
        let actions: string | undefined
        try { actions = fen ? await get().actionsFor?.(texts.join(' '), fen) : undefined } catch { actions = undefined }
        if (!alive()) return
        for (const [i, sentence] of step.sentences.entries()) {
          set({ cues: sentence.cues, caption: sentence.text })
          addConcepts(sentence.cues)
          const quotes = simulate && sentence.parts.some((p) => p.moveId)
          if (!quotes) {
            await say(sentence.speech, lang, rate, planSentence({ sentences: texts, index: i, fen, baseCues: sentence.cues, ...(actions ? { actions } : {}) }), alive)
            if (!alive()) return
            continue
          }
          // A quoted line: every move goes on the board as it is said. A line
          // off the game (a variation) is announced first and closed by naming
          // the last move of the game, 2 s before the board goes back to it.
          const offGame = sentence.parts.some((p) => p.moveId && !tree.mainline.includes(p.moveId))
          if (offGame) {
            await runtime.speaker.speak(variationIntro(lang, introCount++), lang, rate)
            if (!alive()) return
          }
          for (const part of sentence.parts) {
            const v = part.moveId ? tree.nodes.get(part.moveId) : undefined
            if (v) {
              show(tree, v.id)
              set({ cues: [moveCue({ san: v.san, from: v.from, to: v.to, fen: v.fen })] })
            }
            await runtime.speaker.speak(part.speech, lang, rate)
            if (!alive()) return
          }
          if (offGame && step.nodeId) {
            const last = tree.nodes.get(step.nodeId)
            if (last) {
              await runtime.speaker.speak(backToGame(lang, last.color, sanToSpeech(last.san, lang)), lang, rate)
              if (!alive()) return
            }
            await runtime.delay(RETURN_PAUSE * 1000)
          } else {
            await runtime.delay(600 / rate)
          }
          if (!alive()) return
          show(tree, step.nodeId)
          set({ cues: [] })
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
    mismatch: null,
    repeatAfter: 5,
    concepts: [],
    actionsFor: null,
    setActionsFor: (source) => set({ actionsFor: source }),

    restorePosition: () => {
      board().resetPlay()
      set({ mismatch: null })
    },
    load: (script, tree, lang) => {
      halt()
      introCount = 0
      set({
        script, tree, stepIndex: 0, status: 'idle', cues: [], caption: '', expected: null, wrongAttempts: 0,
        mismatch: null, concepts: [], lang: lang ?? detectLang(script.map((s) => s.sentences.map((x) => x.text).join(' ')).join(' ')),
      })
    },
    play: () => {
      const s = get()
      if (!s.tree || s.script.length === 0 || s.status === 'playing' || s.status === 'waiting-move') return
      halt()
      // Start where the board is: the move the reader selected, if it is not
      // the one the narration stopped at.
      let stepIndex = s.status === 'finished' ? 0 : s.stepIndex
      const b = board()
      const here = s.script[stepIndex]
      if (s.status !== 'finished' && b.activeGame === s.tree && b.currentNodeId && here?.nodeId !== b.currentNodeId) {
        const selected = s.script.findIndex((x) => x.kind === 'move' && x.nodeId === b.currentNodeId)
        if (selected >= 0) stepIndex = selected
      }
      set({ status: 'playing', stepIndex, expected: null, mismatch: null })
      void run(runToken)
    },
    pause: () => {
      if (get().status !== 'playing' && get().status !== 'waiting-move') return
      halt()
      set({ status: 'paused', expected: null, mismatch: null })
    },
    stop: () => {
      halt()
      const { tree, status } = get()
      if (tree && status !== 'idle' && board().activeGame === tree) show(tree, null)
      set({ status: 'idle', stepIndex: 0, cues: [], caption: '', expected: null, wrongAttempts: 0, mismatch: null })
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
        stepIndex: index, cues: step.sentences[0].cues, expected: null, mismatch: null,
        caption: step.kind === 'move' ? step.caption : step.sentences[0].text,
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
function samePosition(a: string, b: string) {
  return a.split(' ').slice(0, 4).join(' ') === b.split(' ').slice(0, 4).join(' ')
}

/** Squares whose content differs between two positions. */
export function diffSquares(fenA: string, fenB: string): string[] {
  const cells = (fen: string) => {
    const out: string[] = []
    for (const row of fen.split(' ')[0].split('/')) {
      for (const ch of row) {
        if (/\d/.test(ch)) for (let i = 0; i < Number(ch); i++) out.push('')
        else out.push(ch)
      }
    }
    return out
  }
  const a = cells(fenA)
  const b = cells(fenB)
  const out: string[] = []
  for (let i = 0; i < 64; i++) if (a[i] !== b[i]) out.push(`${'abcdefgh'[i % 8]}${8 - Math.floor(i / 8)}`)
  return out
}

useStudyBoardStore.subscribe((s, prev) => {
  if (s.playFen === prev.playFen) return
  const n = useNarrationStore.getState()
  if (n.status !== 'waiting-move' || !n.expected || !n.tree) return
  const node = n.tree.nodes.get(n.expected.nodeId)
  if (!node) return
  if (!s.playFen) {
    if (n.mismatch) useNarrationStore.setState({ mismatch: null })
    return
  }
  if (samePosition(s.playFen, node.fen)) {
    moveWaiter?.()
  } else if (n.mismatch) {
    // Already off the expected position: keep showing what still differs.
    useNarrationStore.setState({ mismatch: { squares: diffSquares(s.playFen, node.fen), expectedFen: node.fen } })
  } else {
    useStudyBoardStore.getState().resetPlay()
    useNarrationStore.setState({ wrongAttempts: n.wrongAttempts + 1 })
  }
})
