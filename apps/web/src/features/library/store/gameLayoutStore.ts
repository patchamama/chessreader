import type { CommentLayout } from '../utils/gameMarkers'

/**
 * The comment layout the reader chose per game (braces ⇄ paragraphs), kept
 * per book and chapter so it is applied again whenever the chapter renders.
 */
const KEY = 'chessreader-game-layouts-v1'

type All = Record<string, Record<string, CommentLayout>>

function readAll(): All {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? '{}') as All
  } catch {
    return {}
  }
}

const chapterKey = (bookId: number, chapter: number) => `${bookId}:${chapter}`

/** The chosen layouts of a chapter, by game index. */
export function loadGameLayouts(bookId: number, chapter: number): Record<number, CommentLayout> {
  return loadGameLayoutsFrom(readAll()[chapterKey(bookId, chapter)] ?? {})
}

/** Remember the layout of one game; returns the chapter's layouts after the change. */
export function saveGameLayout(bookId: number, chapter: number, gameIndex: number, layout: CommentLayout): Record<number, CommentLayout> {
  const all = readAll()
  const key = chapterKey(bookId, chapter)
  all[key] = { ...(all[key] ?? {}), [gameIndex]: layout }
  writeAll(all)
  return loadGameLayoutsFrom(all[key])
}

/** Forget the layout chosen for one game (its text is written anew, S3). */
export function clearGameLayout(bookId: number, chapter: number, gameIndex: number): void {
  const all = readAll()
  const key = chapterKey(bookId, chapter)
  if (!all[key] || !(String(gameIndex) in all[key])) return
  const rest = { ...all[key] }
  delete rest[String(gameIndex)]
  all[key] = rest
  writeAll(all)
}

function writeAll(all: All): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(all))
  } catch {
    /* not kept: storage full or blocked */
  }
}

function loadGameLayoutsFrom(stored: Record<string, CommentLayout>): Record<number, CommentLayout> {
  return Object.fromEntries(Object.entries(stored).map(([i, l]) => [Number(i), l]))
}
