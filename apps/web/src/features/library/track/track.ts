import { buildNarrationTrack, eventAt, narrationSegments } from '@chess-ebook/chess-shared'
import type { BoardCue, GameTree, Lang, NarrationStep, NarrationTrack, TrackEvent } from '@chess-ebook/chess-shared'
import { httpClient } from '../../../shared/api/httpClient'
import { useAuthStore } from '../../auth/store/authStore'
import { useSettingsStore } from '../../../shared/settings/settingsStore'

export const TRACK_GAP = 0.25

/**
 * The node of `tree` an event of a track talks about. Node ids are made anew
 * every time a text is parsed, so the event is matched by its position (and
 * move). null = the start position; undefined = not in this game.
 */
export function resolveNode(tree: GameTree, event: TrackEvent): string | null | undefined {
  if (event.nodeId && tree.nodes.get(event.nodeId)?.fen === event.fen) return event.nodeId
  for (const node of tree.nodes.values()) {
    if (node.fen === event.fen && (!event.san || node.san === event.san)) return node.id
  }
  return event.fen === tree.startFen ? null : undefined
}

export interface TrackState {
  index: number
  event: TrackEvent
  /** Node to show (undefined: the track is of another game). */
  nodeId: string | null | undefined
  cues: BoardCue[]
  caption: string
  /** The last game move said so far ("12... Nxe5"), for the position hint. */
  label: string
}

const moveLabel = (e: TrackEvent) => `${e.moveNumber}${e.side === 'white' ? '.' : '...'} ${e.san}`

/** Everything a player shows at `time` seconds of the audio. */
export function stateAt(track: NarrationTrack, tree: GameTree, time: number): TrackState {
  const index = eventAt(track, time)
  const event = track.events[index]
  let label = ''
  for (let i = index; i >= 0 && !label; i--) if (track.events[i].kind === 'move') label = moveLabel(track.events[i])
  return { index, event, nodeId: resolveNode(tree, event), cues: event.cues, caption: event.text, label }
}

export const formatTime = (seconds: number) => `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`

export interface RenderInput {
  script: NarrationStep[]
  tree: GameTree
  lang: Lang
  title: string
  white?: string | null
  black?: string | null
}

/** Asks the server for the MP3 of the narration and builds its timed track. */
export async function renderTrack(input: RenderInput): Promise<{ track: NarrationTrack; audio: Blob }> {
  const s = useSettingsStore.getState()
  if (s.voiceProvider === 'browser') {
    throw new Error('The browser voice cannot be saved to a file. Choose a server voice (system, Piper, OpenAI or ElevenLabs) in Settings.')
  }
  const segments = narrationSegments(input.script, input.tree, input.lang)
  const apiKey = s.voiceProvider === 'openai' ? s.openaiKey : s.voiceProvider === 'elevenlabs' ? s.elevenlabsKey : ''
  const rendered = await httpClient<{ id: string; audioUrl: string; durations: number[]; total: number }>('/api/narration/render', {
    method: 'POST',
    body: JSON.stringify({
      segments: segments.map((x) => x.speech), lang: input.lang, gap: TRACK_GAP,
      voice: { provider: s.voiceProvider, voice: s.voiceName, rate: s.voiceRate, model: s.voiceModel, ...(apiKey ? { apiKey } : {}) },
    }),
  })
  const { token } = useAuthStore.getState()
  const response = await fetch(rendered.audioUrl, { headers: token ? { Authorization: `Bearer ${token}` } : {} })
  if (!response.ok) throw new Error('The audio could not be downloaded.')
  const audio = await response.blob()
  const file = `${input.title.replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '').toLowerCase() || 'narration'}.mp3`
  const track = buildNarrationTrack(segments, rendered.durations, {
    lang: input.lang, title: input.title, white: input.white ?? null, black: input.black ?? null,
    voice: `${s.voiceProvider}${s.voiceName ? `:${s.voiceName}` : ''}`, audio: file, gap: TRACK_GAP, startFen: input.tree.startFen,
  })
  return { track, audio }
}
