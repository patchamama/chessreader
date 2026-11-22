import { create } from 'zustand'
import type { CommentLayout } from '../utils/gameMarkers'
import { EXTERNAL_BOOK_ID, useExternalBookStore } from '../../../shared/externalBook/externalBookStore'

/**
 * Games whose commentary the reader regenerated (S3): the new text of each game
 * (from its first move to its last), kept per book and chapter and put back in
 * place whenever the chapter renders. Undo forgets it and the book's own text
 * shows again exactly as before.
 */
const KEY = 'chessreader-game-rewrites-v1'

/** The new text of a game, and the layout the reader had chosen for it before (given back on restore). */
export interface GameRewrite {
  text: string
  layout?: CommentLayout
  /** Lines before the game's first move that the text also replaces (a translation covers them). */
  leading?: number
}

type Rewrites = Record<string, Record<number, GameRewrite>>

export const rewriteKey = (bookId: number, chapter: number) => `${bookId}:${chapter}`

function readAll(): Rewrites {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? '{}') as Record<string, Record<string, GameRewrite>>
    return Object.fromEntries(Object.entries(raw).map(([k, games]) => [
      k,
      Object.fromEntries(Object.entries(games).filter(([, r]) => typeof r?.text === 'string').map(([i, r]) => [Number(i), r])),
    ]))
  } catch {
    return {}
  }
}

function writeAll(rewrites: Rewrites): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(rewrites))
  } catch {
    /* not kept: storage full or blocked; it still shows until the page is reloaded */
  }
}

interface GameRewriteState {
  rewrites: Rewrites
  /** Keep the new text of one game. */
  save: (bookId: number, chapter: number, gameIndex: number, rewrite: GameRewrite) => void
  /** Forget it: the book's own text of that game shows again. Returns what was forgotten. */
  clear: (bookId: number, chapter: number, gameIndex: number) => GameRewrite | undefined
}

export const useGameRewriteStore = create<GameRewriteState>((set, get) => ({
  rewrites: readAll(),
  save: (bookId, chapter, gameIndex, rewrite) => {
    const key = rewriteKey(bookId, chapter)
    const rewrites = { ...get().rewrites, [key]: { ...(get().rewrites[key] ?? {}), [gameIndex]: rewrite } }
    writeAll(rewrites)
    set({ rewrites })
  },
  clear: (bookId, chapter, gameIndex) => {
    const key = rewriteKey(bookId, chapter)
    const games = { ...(get().rewrites[key] ?? {}) }
    const removed = games[gameIndex]
    delete games[gameIndex]
    const rewrites = { ...get().rewrites, [key]: games }
    writeAll(rewrites)
    set({ rewrites })
    return removed
  },
}))

// The book opened from outside (-1) is a different book every time one is opened there:
// what was rewritten in the previous one must not show up in the next.
let externalVersion = useExternalBookStore.getState().version
useExternalBookStore.subscribe((state) => {
  if (state.version === externalVersion) return
  externalVersion = state.version
  const rewrites = Object.fromEntries(
    Object.entries(useGameRewriteStore.getState().rewrites).filter(([key]) => !key.startsWith(`${EXTERNAL_BOOK_ID}:`)),
  )
  writeAll(rewrites)
  useGameRewriteStore.setState({ rewrites })
})
