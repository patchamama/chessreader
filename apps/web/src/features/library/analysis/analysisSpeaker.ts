import { browserSpeaker, type Speaker } from '../narration/speaker'

let speaker: Speaker | null = null

/** Swap the voice of the analysis boards (tests, or another output device). */
export function setAnalysisSpeaker(next: Speaker) {
  speaker = next
}

/** The voice of the analysis boards: the browser's speech synthesis unless swapped. */
export const analysisVoice = (): Speaker => (speaker ??= browserSpeaker())
