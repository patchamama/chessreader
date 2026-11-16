import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { GameReview, GameTree, PlyInput } from '@chess-ebook/chess-shared'
import { createEngineAnalyser, type AnalysePosition } from './reviewEngine'

/** A finished review, kept as a small record so a chapter or a whole book can be summed up later. */
export interface ReviewRecord {
  bookId: number
  chapter: number
  gameIndex: number
  white: string | null
  black: string | null
  accuracyWhite: number
  accuracyBlack: number
  moves: number
}

export interface ReviewedGame {
  plies: PlyInput[]
  review: GameReview
}

interface ReviewState {
  /** Reviews of the games open right now (not persisted: trees live in memory). */
  byTree: Map<GameTree, ReviewedGame>
  /** Summaries of every game ever reviewed, per book and chapter (persisted). */
  records: ReviewRecord[]
  setReview: (tree: GameTree, reviewed: ReviewedGame, record: ReviewRecord) => void
  clearBook: (bookId: number) => void
}

export const useReviewStore = create<ReviewState>()(
  persist(
    (set) => ({
      byTree: new Map(),
      records: [],
      setReview: (tree, reviewed, record) =>
        set((s) => ({
          byTree: new Map(s.byTree).set(tree, reviewed),
          records: [
            ...s.records.filter((r) => !(r.bookId === record.bookId && r.chapter === record.chapter && r.gameIndex === record.gameIndex)),
            record,
          ],
        })),
      clearBook: (bookId) => set((s) => ({ records: s.records.filter((r) => r.bookId !== bookId) })),
    }),
    { name: 'chessreader-reviews', partialize: (s) => ({ records: s.records }) },
  ),
)

/** Average accuracy of each player over a set of reviewed games (by name; unnamed sides by colour). */
export function summarise(records: ReviewRecord[]): Array<{ name: string; games: number; accuracy: number }> {
  const acc = new Map<string, { sum: number; games: number }>()
  const add = (name: string, value: number) => {
    const cur = acc.get(name) ?? { sum: 0, games: 0 }
    acc.set(name, { sum: cur.sum + value, games: cur.games + 1 })
  }
  for (const r of records) {
    add(r.white ?? 'White', r.accuracyWhite)
    add(r.black ?? 'Black', r.accuracyBlack)
  }
  return [...acc.entries()]
    .map(([name, v]) => ({ name, games: v.games, accuracy: Math.round((v.sum / v.games) * 10) / 10 }))
    .sort((a, b) => b.games - a.games || b.accuracy - a.accuracy)
}

let analyser: { analyse: AnalysePosition; dispose: () => void } | null = null
let override: AnalysePosition | null = null
/** The engine used for reviews and move hints (one shared worker). */
export function reviewEngine(sfUrl?: string): AnalysePosition {
  if (override) return override
  if (!analyser) analyser = createEngineAnalyser(sfUrl)
  return analyser.analyse
}
/** Swap the engine (tests). */
export function setReviewEngine(fn: AnalysePosition | null) {
  override = fn
}
