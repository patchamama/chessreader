import { describe, it, expect, vi, beforeEach } from 'vitest'
import { recognizeGames, buildNarrationScript, narrationSegments, buildNarrationTrack } from '@chess-ebook/chess-shared'
import { stateAt, resolveNode, renderTrack, formatTime } from './track'
import { useSettingsStore } from '../../../shared/settings/settingsStore'

const TEXT = ['Opera', '1. e4 e5 2. Nf3 d6', 'Lo normal es 2... Nc6 3. Bb5. El centro.', '3. d4'].join('\n')
const parse = () => recognizeGames(TEXT, { algorithm: 2 })[0]
const game = parse()
const script = buildNarrationScript(TEXT, game, { from: 0, lang: 'es' })
const segments = narrationSegments(script, game.tree)
const track = buildNarrationTrack(segments, segments.map(() => 2), { lang: 'es', title: 'Opera', gap: 0.5, startFen: game.tree.startFen, audio: 'a.mp3' })

describe('stateAt', () => {
  it('gives what the board shows at a time of the audio: position, cues, caption, move', () => {
    const e4 = track.events.findIndex((e) => e.san === 'e4')
    const s = stateAt(track, game.tree, track.events[e4].t0 + 0.1)
    expect(s.index).toBe(e4)
    expect(s.nodeId).toBe(game.tree.mainline[0])
    expect(s.caption).toBe('1. e4')
    expect(s.cues[0].kind).toBe('move')
    expect(s.label).toBe('1. e4')
  })
  it('after a seek into a quoted variation the board is on that variation move', () => {
    const nc6 = track.events.findIndex((e) => e.kind === 'variation' && e.san === 'Nc6')
    const s = stateAt(track, game.tree, track.events[nc6].t0 + 1)
    expect(game.tree.nodes.get(s.nodeId!)!.san).toBe('Nc6')
    expect(game.tree.mainline).not.toContain(s.nodeId)
  })
  it('finds the positions of a track in a game parsed again (node ids differ between sessions)', () => {
    const again = parse()
    const d4 = track.events.find((e) => e.san === 'd4')!
    expect(again.tree.nodes.get(resolveNode(again.tree, d4)!)!.san).toBe('d4')
    expect(resolveNode(again.tree, track.events[0])).toBeNull()
  })
  it('formats times', () => {
    expect(formatTime(75.4)).toBe('1:15')
  })
})

describe('renderTrack', () => {
  beforeEach(() => useSettingsStore.getState().reset())

  it('sends what is said to the server and times the track with what comes back', async () => {
    const bodies: unknown[] = []
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (String(url).endsWith('/api/narration/render')) {
        bodies.push(JSON.parse(String(init!.body)))
        return new Response(JSON.stringify({ id: 'abc', audioUrl: '/api/narration/audio/abc.mp3', durations: segments.map(() => 1.5), total: 99 }), { status: 200 })
      }
      return new Response(new Blob(['mp3']), { status: 200 })
    })
    vi.stubGlobal('fetch', fetchMock)
    useSettingsStore.setState({ voiceProvider: 'openai', voiceName: 'nova', openaiKey: 'sk-test', voiceRate: 1.25 })
    const out = await renderTrack({ script, tree: game.tree, lang: 'es', title: 'Opera', white: 'A', black: 'B' })
    expect(bodies[0]).toMatchObject({
      segments: segments.map((s) => s.speech), lang: 'es', gap: 0.25,
      voice: { provider: 'openai', voice: 'nova', apiKey: 'sk-test', rate: 1.25 },
    })
    expect(out.track.events[1].t0).toBe(1.75)
    expect(out.track).toMatchObject({ title: 'Opera', white: 'A', black: 'B', voice: 'openai:nova' })
    expect(out.audio.size).toBeGreaterThan(0)
    vi.unstubAllGlobals()
  })

  it('the browser voice cannot make a file: it says so', async () => {
    useSettingsStore.setState({ voiceProvider: 'browser' })
    await expect(renderTrack({ script, tree: game.tree, lang: 'es', title: 'x' })).rejects.toThrow(/server voice/)
  })
})
