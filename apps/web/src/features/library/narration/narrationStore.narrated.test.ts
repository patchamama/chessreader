import { beforeEach, describe, expect, it } from 'vitest'
import { buildNarrationScript, recognizeGames } from '@chess-ebook/chess-shared'
import { setNarrationRuntime, useNarrationStore } from './narrationStore'
import { useStudyBoardStore } from '../store/studyBoardStore'

const TEXT = [
  'La partida de la Ópera',
  '1. e4 e5 2. ♘f3 d6',
  'La Defensa Philidor. Las negras sostienen el peón de e5.',
  '3. d4 ♗g4',
].join('\n')
const [game] = recognizeGames(TEXT, { algorithm: 2 })
const script = buildNarrationScript(TEXT, game, { from: 0, to: TEXT.length })
const flush = () => new Promise((r) => setTimeout(r, 0))

beforeEach(() => {
  useStudyBoardStore.getState().reset()
  useNarrationStore.getState().stop()
  setNarrationRuntime({ speaker: { speak: async () => {}, cancel: () => {} }, delay: async () => {} })
})

describe('the narrator says which word and action it is at (ai-narration-guides S2)', () => {
  it('publishes the comment and the word reached, at each sentence and each action, then clears it', async () => {
    const seen: { text: string; at: number }[] = []
    const unsub = useNarrationStore.subscribe((s, prev) => { if (s.narrated && s.narrated !== prev.narrated) seen.push(s.narrated) })
    const n = useNarrationStore.getState()
    n.setActionsFor((t) => (t.includes('Defensa') ? '0Square:e5, 5Arrow:f1-b5' : undefined))
    n.load(script, game.tree)
    n.setOption({ simulate: false })
    n.play()
    for (let i = 0; i < 200 && useNarrationStore.getState().status !== 'finished'; i++) await flush()
    unsub()
    const ats = seen.map((x) => x.at)
    expect(ats).toContain(0)
    expect(ats).toContain(3)
    expect(ats).toContain(5)
    expect(seen[0].text).toContain('La Defensa Philidor.')
    expect(useNarrationStore.getState().narrated).toBeNull()
  })

  it('publishes nothing for a comment without actions', async () => {
    let any = false
    const unsub = useNarrationStore.subscribe((s) => { if (s.narrated) any = true })
    const n = useNarrationStore.getState()
    n.setActionsFor(() => undefined)
    n.load(script, game.tree)
    n.setOption({ simulate: false })
    n.play()
    for (let i = 0; i < 200 && useNarrationStore.getState().status !== 'finished'; i++) await flush()
    unsub()
    expect(any).toBe(false)
  })
})
