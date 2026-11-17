import { describe, it, expect, beforeEach } from 'vitest'
import { recognizeGames, buildNarrationScript } from '@chess-ebook/chess-shared'
import { useNarrationStore, setNarrationRuntime } from './narrationStore'
import { useStudyBoardStore } from '../store/studyBoardStore'
import { useSettingsStore } from '../../../shared/settings/settingsStore'

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
    n.setOption({ simulate: false })
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
    expect(spoken[spoken.length - 1]).toBe('1. peón a e 4')
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
    expect(spoken[spoken.length - 1]).toBe('peón a e 5')
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

describe('narration fixes', () => {
  const variationIds = script[8].sentences[1].moves

  it('shows each quoted variation move WHILE it is said, not after the sentence', async () => {
    const atSpeech: Array<[string, string | null]> = []
    setNarrationRuntime({
      speaker: { speak: async (text) => { atSpeech.push([text, useStudyBoardStore.getState().currentNodeId]) }, cancel: () => {} },
      delay: async () => {},
    })
    const n = useNarrationStore.getState()
    n.load(script, game.tree)
    n.setOption({ simulate: true, mode: 'auto' })
    n.play()
    await settle(() => useNarrationStore.getState().status === 'finished')
    const exd4 = atSpeech.find(([text]) => text.startsWith('peón e por de 4'))!
    expect(exd4[1]).toBe(variationIds[0])
    const nxd4 = atSpeech.find(([text]) => text.startsWith('caballo por de 4'))!
    expect(nxd4[1]).toBe(variationIds[1])
  })

  it('starts at the move selected on the board, not at the beginning', async () => {
    const n = useNarrationStore.getState()
    n.load(script, game.tree)
    n.setOption({ mode: 'auto', simulate: false })
    useStudyBoardStore.getState().loadPosition(game.tree, main[4], false)
    n.play()
    await settle(() => useNarrationStore.getState().status === 'finished')
    expect(spoken[0]).toBe(script.find((s) => s.nodeId === main[4] && s.kind === 'move')!.speech)
  })

  it('manual mode accepts the move made while it was still being announced', async () => {
    const node = game.tree.nodes.get(main[0])!
    setNarrationRuntime({
      speaker: {
        speak: async (text) => {
          spoken.push(text)
          if (text.includes('peón a e 4')) useStudyBoardStore.getState().playMove(node.from, node.to, game.tree.startFen)
        },
        cancel: () => {},
      },
      delay: async () => {},
    })
    const n = useNarrationStore.getState()
    n.load(script, game.tree)
    n.setOption({ mode: 'manual', simulate: false })
    n.goTo(1)
    n.play()
    await settle(() => useNarrationStore.getState().stepIndex >= 2)
    expect(useNarrationStore.getState().stepIndex).toBeGreaterThanOrEqual(2)
  })

  it('manual mode reports the squares that differ when the board is somewhere else', async () => {
    setNarrationRuntime({
      speaker: {
        speak: async (text) => {
          if (text.includes('peón a e 4')) useStudyBoardStore.getState().playMove('d2', 'd4', game.tree.startFen)
        },
        cancel: () => {},
      },
      delay: async () => {},
    })
    const n = useNarrationStore.getState()
    n.load(script, game.tree)
    n.setOption({ mode: 'manual', simulate: false })
    n.goTo(1)
    n.play()
    await settle(() => useNarrationStore.getState().mismatch !== null)
    const m = useNarrationStore.getState().mismatch!
    expect(m.squares.sort()).toEqual(['d2', 'd4', 'e2', 'e4'])
    expect(m.expectedFen).toBe(game.tree.nodes.get(main[0])!.fen)
    expect(useNarrationStore.getState().status).toBe('waiting-move')
  })

  it('manual mode repeats the announcement when no move comes', async () => {
    let timeouts = 0
    setNarrationRuntime({
      speaker: { speak: async (text) => { spoken.push(text) }, cancel: () => {} },
      delay: async () => {},
      timeout: () => (timeouts++ < 2 ? Promise.resolve() : new Promise(() => {})),
    })
    const n = useNarrationStore.getState()
    n.load(script, game.tree)
    n.setOption({ mode: 'manual', simulate: false, repeatAfter: 5 })
    n.goTo(1)
    n.play()
    await settle(() => spoken.length >= 3)
    expect(spoken).toEqual([script[1].speech, script[1].speech, script[1].speech])
    expect(useNarrationStore.getState().status).toBe('waiting-move')
  })
})

describe('variations announced and closed (S19)', () => {
  it('says a variation starts, and after it names the last move of the game and waits 2 s before going back', async () => {
    const waits: number[] = []
    const events: string[] = []
    setNarrationRuntime({
      speaker: { speak: async (text) => { events.push(`say:${text}`) }, cancel: () => {} },
      delay: async (ms) => { waits.push(ms); events.push(`wait:${ms}`) },
    })
    const n = useNarrationStore.getState()
    n.load(script, game.tree, 'es')
    n.setOption({ simulate: true, mode: 'auto', rate: 1 })
    n.play()
    await settle(() => useNarrationStore.getState().status === 'finished')
    const intro = events.findIndex((e) => /^say:(Analicemos la siguiente variante|Hay una variante interesante|Veamos qué pasaría)/.test(e))
    const firstMove = events.findIndex((e) => e.startsWith('say:peón e por de 4'))
    expect(intro).toBeGreaterThan(-1)
    expect(intro).toBeLessThan(firstMove)
    const back = events.findIndex((e) => e.startsWith('say:Volvamos a la partida'))
    expect(events[back]).toBe('say:Volvamos a la partida: la última jugada de las negras fue alfil ge 4.')
    expect(events[back + 1]).toBe('wait:2000')
  })
})

describe('the pause after each move, chosen in the settings (S32)', () => {
  it('waits that long after every game move it says', async () => {
    const delays: number[] = []
    setNarrationRuntime({ speaker: { speak: async (text) => { spoken.push(text) }, cancel: () => {} }, delay: async (ms) => { delays.push(ms) } })
    useSettingsStore.setState({ narrationMovePause: 2 })
    const n = useNarrationStore.getState()
    n.load(script, game.tree)
    n.setOption({ simulate: false })
    n.play()
    await settle(() => useNarrationStore.getState().status === 'finished')
    expect(delays.filter((d) => d === 2000)).toHaveLength(script.filter((s) => s.kind === 'move').length)
    useSettingsStore.setState({ narrationMovePause: 0 })
  })
})
