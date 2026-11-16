import { isDemoHost } from '../shared/env/devMode'

/** Demo chapters that ship a ready-made narration (MP3 + track): [book, chapter] → file stem. */
const SAMPLES: Record<string, string> = { '1:1': 'opera-es', '2:1': 'opera-en', '4:1': 'opera-de' }

/**
 * The sample MP3 and track of a demo chapter, if it has one. The demo has no
 * server to render audio, so these were rendered beforehand with system voices.
 */
export function demoTrackFor(bookId: number, chapter: number): { track: string; audio: string } | undefined {
  const stem = SAMPLES[`${bookId}:${chapter}`]
  if (!stem || !(isDemoHost() || import.meta.env.VITE_DEMO === 'true')) return undefined
  const base = `${import.meta.env.BASE_URL}demo-audio/${stem}`
  return { track: `${base}.track.json`, audio: `${base}.mp3` }
}
