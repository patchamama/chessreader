import { describe, it, expect } from 'vitest'
import { recognizeGames } from '../../recognition/recognizeGames.js'
import { buildNarrationScript } from '../../teaching/narration.js'
import { narrationSegments, buildNarrationTrack, eventAt, TRACK_FORMAT } from '../../teaching/narrationTrack.js'

const TEXT = ['Opera', '1. e4 e5 2. Nf3 d6 3. d4 Bg4?!', 'Lo normal es 3... exd4 4. Nxd4. La diagonal d1-h5 queda clavada.', '4. dxe5'].join('\n')
const [game] = recognizeGames(TEXT, { algorithm: 2 })
const script = buildNarrationScript(TEXT, game, { from: 0, lang: 'es' })
const segments = narrationSegments(script, game.tree)

describe('narrationSegments', () => {
  it('gives one segment per thing said, in order, each with the position on the board', () => {
    expect(segments.map((s) => s.kind)).toEqual([
      'comment', 'move', 'move', 'move', 'move', 'move', 'move',
      'comment', 'variation', 'variation', 'comment', 'move',
    ])
    const e4 = segments[1]
    expect(e4).toMatchObject({ kind: 'move', side: 'white', moveNumber: 1, san: 'e4', from: 'e2', to: 'e4', pause: true })
    expect(e4.fen).toBe(game.tree.nodes.get(game.tree.mainline[0])!.fen)
    expect(e4.fenBefore).toBe(game.tree.startFen)
  })
  it('a move carries its quality; a variation move says where to come back to', () => {
    expect(segments[6]).toMatchObject({ san: 'Bg4', side: 'black', quality: 'dubious' })
    const exd4 = segments[8]
    expect(exd4).toMatchObject({ kind: 'variation', san: 'exd4', returnTo: game.tree.mainline[5] })
    expect(exd4.fen).not.toBe(segments[7].fen)
  })
  it('keeps the board cues of what is said (a diagonal with its first and last square)', () => {
    const line = segments[10].cues.find((c) => c.kind === 'line')!
    expect(line.squares[0].square).toBe('d1')
    expect(line.squares[line.squares.length - 1].square).toBe('h5')
  })
})

describe('buildNarrationTrack', () => {
  const durations = segments.map((_, i) => 1 + i * 0.5)
  const track = buildNarrationTrack(segments, durations, { lang: 'es', title: 'Opera', gap: 0.25, startFen: game.tree.startFen, audio: 'opera.mp3' })

  it('times every segment on the audio, gaps included', () => {
    expect(track.format).toBe(TRACK_FORMAT)
    expect(track.events[0]).toMatchObject({ t0: 0, t1: 1 })
    expect(track.events[1]).toMatchObject({ t0: 1.25, t1: 2.75 })
    const total = durations.reduce((a, b) => a + b, 0) + 0.25 * (segments.length - 1)
    expect(track.audio).toEqual({ file: 'opera.mp3', duration: Math.round(total * 1000) / 1000 })
  })
  it('finds the event at any time of the audio', () => {
    expect(eventAt(track, 0)).toBe(0)
    expect(eventAt(track, 1.1)).toBe(0) // in the gap: still the event just said
    expect(eventAt(track, 1.3)).toBe(1)
    expect(eventAt(track, 9999)).toBe(track.events.length - 1)
  })
  it('is plain JSON', () => {
    expect(JSON.parse(JSON.stringify(track))).toEqual(track)
  })
})
