import { actionSchedule, cuesAt, narrationWords, parseActions, proseMoveSchedule, validateActions } from '@chess-ebook/chess-shared'
import type { BoardCue, TimedCues } from '@chess-ebook/chess-shared'

/** What the board shows while one sentence is said: a starting board, then marks added as the narrator reaches a word. */
export interface SentencePlan {
  base: BoardCue[]
  /** Local word index (from the start of the sentence) and the marks to add (or wipe first). */
  reveals: TimedCues[]
}

/**
 * The plan of sentence `index` of a comment. With the comment's actions (checked against the
 * position, the ones that do not fit discarded) the narrator performs them; without, the moves
 * the sentence writes ("Aa4", "con c3, con idea de d4", "Cge7 … Cg6") are read on the position.
 * Token indices of actions count the words of the whole comment, sentences joined.
 */
export function planSentence(o: { sentences: string[]; index: number; fen: string | null; baseCues: BoardCue[]; actions?: string }): SentencePlan {
  const text = o.sentences[o.index] ?? ''
  if (!o.fen) return { base: o.baseCues, reveals: [] }
  const words = (s: string) => narrationWords(s).length
  const offset = o.sentences.slice(0, o.index).reduce((n, s) => n + words(s), 0)
  const length = words(text)
  if (o.actions?.trim()) {
    const parsed = parseActions(o.actions).actions
    const { valid } = validateActions(parsed, o.fen, { words: o.sentences.reduce((n, s) => n + words(s), 0) })
    return {
      base: cuesAt(valid, offset),
      reveals: actionSchedule(valid.filter((a) => a.at > offset && a.at < offset + length)).map((r) => ({ ...r, at: r.at - offset })),
    }
  }
  return { base: o.baseCues, reveals: proseMoveSchedule(text, o.fen) }
}
