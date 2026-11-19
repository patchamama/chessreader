import type { TutorNote } from './playStore'

/**
 * Add a tutor note to the log. The same comment by the same speaker right
 * after itself is not written again: the existing line counts it (2x, 3x…).
 */
export function appendNote(log: TutorNote[], note: TutorNote): TutorNote[] {
  const last = log[log.length - 1]
  if (last && last.who === note.who && last.text === note.text) {
    return [...log.slice(0, -1), { ...last, ...note, count: (last.count ?? 1) + 1 }]
  }
  return [...log, note]
}
