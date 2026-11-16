import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { recognizeGames, buildNarrationScript, narrationSegments, buildNarrationTrack } from '@chess-ebook/chess-shared'
import { TrackPlayer } from './TrackPlayer'
import { useStudyBoardStore } from '../store/studyBoardStore'
import { useNarrationStore } from '../narration/narrationStore'
import { useSettingsStore } from '../../../shared/settings/settingsStore'

const TEXT = ['Opera', '1. e4 e5 2. Nf3 d6', 'El centro es importante.', '3. d4'].join('\n')
const games = recognizeGames(TEXT, { algorithm: 2 })
const tree = games[0].tree
// The track was made from ANOTHER parse of the same text (as a saved file would be).
const other = recognizeGames(TEXT, { algorithm: 2 })[0]
const segments = narrationSegments(buildNarrationScript(TEXT, other, { from: 0, lang: 'es' }), other.tree)
const track = buildNarrationTrack(segments, segments.map(() => 2), { lang: 'es', title: 'Opera', gap: 0.5, startFen: tree.startFen, audio: 'opera.mp3' })

beforeEach(() => {
  useStudyBoardStore.getState().reset()
  useSettingsStore.setState({ language: 'en', voiceProvider: 'system' })
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(track), { status: 200 })))
  URL.createObjectURL = vi.fn(() => 'blob:x')
  URL.revokeObjectURL = vi.fn()
})

async function loaded() {
  render(<TrackPlayer games={games} text={TEXT} sample={{ track: '/t.json', audio: '/a.mp3' }} />)
  fireEvent.click(screen.getByRole('button', { name: 'Load the sample track' }))
  return (await screen.findByTestId('track-audio')) as HTMLAudioElement
}
const at = (audio: HTMLAudioElement, seconds: number, event = 'timeUpdate') => {
  Object.defineProperty(audio, 'currentTime', { configurable: true, writable: true, value: seconds })
  fireEvent[event as 'timeUpdate'](audio)
}

describe('TrackPlayer', () => {
  it('the board follows the audio and shows where it is', async () => {
    const audio = await loaded()
    const nf3 = track.events.find((e) => e.san === 'Nf3')!
    at(audio, nf3.t0 + 0.2)
    await waitFor(() => expect(useStudyBoardStore.getState().currentNodeId).toBe(tree.mainline[2]))
    expect(screen.getByTestId('track-now')).toHaveTextContent('Now: 2. Nf3')
    expect(useNarrationStore.getState().cues[0].kind).toBe('move')
  })

  it('moving the audio to another point puts the game there', async () => {
    const audio = await loaded()
    at(audio, track.events.find((e) => e.san === 'd4')!.t0 + 0.1)
    await waitFor(() => expect(useStudyBoardStore.getState().currentNodeId).toBe(tree.mainline[4]))
    at(audio, track.events.find((e) => e.san === 'e5')!.t0 + 0.1, 'seeked')
    await waitFor(() => expect(useStudyBoardStore.getState().currentNodeId).toBe(tree.mainline[1]))
  })

  it('every move has a mark on the strip that takes the audio to it', async () => {
    const audio = await loaded()
    const e5 = track.events.find((e) => e.san === 'e5')!
    fireEvent.click(screen.getByRole('button', { name: /^1\.\.\. e5 · / }))
    expect(audio.currentTime).toBe(e5.t0)
    await waitFor(() => expect(useStudyBoardStore.getState().currentNodeId).toBe(tree.mainline[1]))
    expect(screen.getAllByRole('button', { name: / · \d+:\d\d$/ })).toHaveLength(5)
  })

  it('in "wait for my move" it stops after announcing a move until it is made', async () => {
    const audio = await loaded()
    audio.pause = vi.fn()
    audio.play = vi.fn(async () => {})
    fireEvent.click(screen.getByRole('checkbox', { name: 'Wait for my move' }))
    const e4 = track.events.find((e) => e.san === 'e4')!
    at(audio, e4.t1)
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('e2 → e4'))
    expect(audio.pause).toHaveBeenCalled()
    expect(useStudyBoardStore.getState().currentNodeId).toBeNull() // still before the move
    useStudyBoardStore.getState().playMove('e2', 'e4', tree.startFen)
    await waitFor(() => expect(audio.play).toHaveBeenCalled())
  })

  it('cannot generate a file with the browser voice, and says why', () => {
    useSettingsStore.setState({ voiceProvider: 'browser' })
    render(<TrackPlayer games={games} text={TEXT} />)
    expect(screen.getByRole('button', { name: /Generate MP3 and track/ })).toBeDisabled()
    expect(screen.getByText(/A file needs a server voice/)).toBeInTheDocument()
  })
})
