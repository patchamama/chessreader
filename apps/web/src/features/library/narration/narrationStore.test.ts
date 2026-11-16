import { describe, it, expect, beforeEach } from 'vitest'
import { recognizeGames, buildNarrationScript } from '@chess-ebook/chess-shared'
import { useNarrationStore, setNarrationRuntime } from './narrationStore'
import { useStudyBoardStore } from '../store/studyBoardStore'

const TEXT = [
  'La partida de la Ópera',
  '1. e4 e5 2. ♘f3 d6',
  'La Defensa Philidor. Las negras sostienen el peón de e5.',
  '3. d4 ♗g4',
  'Una clavada sobre el caballo de f3. Lo normal es 3... exd4 4. ♘xd4.',
  '4. dxe5',
].join('\n')
const [game] = recognizeGames(TEXT, { algorithm: 2 })
const script = buildNarrationScript(TEXT, game, { from: 0, to: TEXT.length })
const main = game.tree.mainline

let spoken: string[]
/** Positions (node ids) the board showed, in order. */
let shown: (string | null)[]
const flush = () => new Promise((r) => setTimeout(r, 0))
async function settle(until: () => boolean) {
  for (let i = 0; i < 200 && !until(); i++) await flush()
}

beforeEach(() => {
  spoken = []
  shown = []
  useStudyBoardStore.getState().reset()
  useNarrationStore.getState().stop()
  setNarrationRuntime({
    speaker: { speak: async (text) => { spoken.push(text) }, cancel: () => {} },
    delay: async () => {},
  })
  useStudyBoardStore.subscribe((s, prev) => {
    if (s.currentNodeId !== prev.currentNodeId) shown.push(s.currentNodeId)
  })
})

describe('narration, automatic mode', () => {
  it('speaks every sentence in order and ends on the last move', async () => {
    const n = useNarrationStore.getState()
    n.load(script, game.tree)
    n.play()
    await settle(() => useNarrationStore.getState().status === 'finished')
    expect(spoken).toEqual(script.flatMap((s) => s.sentences.map((x) => x.speech)))
    expect(useStudyBoardStore.getState().currentNodeId).toBe(main[main.length - 1])
    expect(useNarrationStore.getState().status).toBe('finished')
  })

  it('shows the cues of the sentence being spoken', async () => {
    const seen: string[] = []
    setNarrationRuntime({
      speaker: {
        speak: async (text) => {
          if (text.includes('sostienen')) {
            seen.push(...useNarrationStore.getState().cues.flatMap((c) => c.squares.map((s) => `${s.square}:${s.role}`)))
          }
        },
        cancel: () => {},
      },
      delay: async () => {},
    })
    const n = useNarrationStore.getState()
    n.load(script, game.tree)
    n.play()
    await settle(() => useNarrationStore.getState().status === 'finished')
    expect(seen).toContain('e5:piece')
  })

  it('collects the concepts as they are mentioned', async () => {
    const n = useNarrationStore.getState()
    n.load(script, game.tree)
    n.play()
    await settle(() => useNarrationStore.getState().status === 'finished')
    expect(useNarrationStore.getState().concepts).toContain('pin')
  })

  it('simulates the variation a comment quotes, then returns to the game', async () => {
    const n = useNarrationStore.getState()
    n.load(script, game.tree)
    n.setOption({ simulate: true })
    n.play()
    await settle(() => useNarrationStore.getState().status === 'finished')
    const variation = [...game.tree.nodes.values()].filter((x) => !main.includes(x.id)).map((x) => x.id)
    expect(variation.length).toBe(2)
    for (const id of variation) expect(shown).toContain(id)
    // After the simulated line the board is back on 3...Bg4 before 4.dxe5.
    const back = shown.lastIndexOf(main[5])
    expect(back).toBeGreaterThan(shown.indexOf(variation[1]))
  })

  it('without the simulate option the variation is only spoken', async () => {
    const n = useNarrationStore.getState()
    n.load(script, game.tree)
    n.setOption({ simulate: false })
    n.play()
    await settle(() => useNarrationStore.getState().status === 'finished')
    const variation = [...game.tree.nodes.values()].filter((x) => !main.includes(x.id)).map((x) => x.id)
    for (const id of variation) expect(shown).not.toContain(id)
  })
})

describe('narration, "I move the pieces" mode', () => {
  it('announces the move, shows it and waits for it on the board', async () => {
    const n = useNarrationStore.getState()
    n.load(script, game.tree)
    n.setOption({ mode: 'manual' })
    n.play()
    await settle(() => useNarrationStore.getState().status === 'waiting-move')
    const s = useNarrationStore.getState()
    expect(spoken[spoken.length - 1]).toBe('1. Blancas: peón a e 4')
    expect(s.expected).toMatchObject({ from: 'e2', to: 'e4' })
    // The board still shows the position BEFORE the move, with the move lit.
    expect(useStudyBoardStore.getState().currentNodeId).toBeNull()
    expect(s.cues[0].arrows).toEqual([{ from: 'e2', to: 'e4', role: 'to' }])
  })

  it('rejects a different move and keeps waiting', async () => {
    const n = useNarrationStore.getState()
    n.load(script, game.tree)
    n.setOption({ mode: 'manual' })
    n.play()
    await settle(() => useNarrationStore.getState().status === 'waiting-move')
    const START = game.tree.startFen
    useStudyBoardStore.getState().playMove('d2', 'd4', START)
    await flush()
    expect(useNarrationStore.getState().status).toBe('waiting-move')
    expect(useNarrationStore.getState().wrongAttempts).toBe(1)
    expect(useStudyBoardStore.getState().playFen).toBeNull()
  })

  it('accepts the announced move and goes on to the next one', async () => {
    const n = useNarrationStore.getState()
    n.load(script, game.tree)
    n.setOption({ mode: 'manual' })
    n.play()
    await settle(() => useNarrationStore.getState().status === 'waiting-move')
    useStudyBoardStore.getState().playMove('e2', 'e4', game.tree.startFen)
    await settle(() => useNarrationStore.getState().expected?.to === 'e5')
    expect(useStudyBoardStore.getState().currentNodeId).toBe(main[0])
    expect(useNarrationStore.getState().status).toBe('waiting-move')
    expect(spoken[spoken.length - 1]).toBe('1. Negras: peón a e 5')
  })
})

describe('narration controls', () => {
  it('pause stops the narration and play resumes at the same step', async () => {
    let gate: (() => void) | null = null
    setNarrationRuntime({
      speaker: {
        speak: (text) => new Promise<void>((resolve) => { spoken.push(text); gate = resolve }),
        cancel: () => { gate?.() },
      },
      delay: async () => {},
    })
    const n = useNarrationStore.getState()
    n.load(script, game.tree)
    n.play()
    await settle(() => spoken.length === 1)
    n.pause()
    await flush()
    expect(useNarrationStore.getState().status).toBe('paused')
    const at = useNarrationStore.getState().stepIndex
    n.play()
    await settle(() => spoken.length === 2)
    expect(useNarrationStore.getState().stepIndex).toBe(at)
    expect(spoken[1]).toBe(spoken[0])
    n.stop()
    expect(useNarrationStore.getState().status).toBe('idle')
    expect(useNarrationStore.getState().cues).toEqual([])
  })

  it('goTo jumps to a step and shows its position', () => {
    const n = useNarrationStore.getState()
    n.load(script, game.tree)
    const idx = script.findIndex((s) => s.kind === 'comment')
    n.goTo(idx)
    expect(useNarrationStore.getState().stepIndex).toBe(idx)
    expect(useStudyBoardStore.getState().currentNodeId).toBe(script[idx].nodeId)
    expect(useNarrationStore.getState().caption).toBe(script[idx].sentences[0].text)
  })
})
