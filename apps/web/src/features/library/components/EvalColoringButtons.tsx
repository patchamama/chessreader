import { useEffect, useRef, useState } from 'react'
import type { RecognizedGame } from '@chess-ebook/chess-shared'
import { withProgress } from '../../../shared/layout/busyStore'
import { STOCKFISH_VERSIONS, useSettingsStore } from '../../../shared/settings/settingsStore'
import { qualitiesOf, useEvalColoringStore } from '../store/evalColoringStore'
import { evaluateChapterGames, evaluateWholeBook, type EvaluateOptions } from '../review/evaluateMoves'
import { reviewEngine } from '../review/reviewStore'

/** Depth of the colouring: shallow enough to go through a whole book, the review depth when lower. */
const COLORING_DEPTH = 12

function engineOptions(): Pick<EvaluateOptions, 'analyse' | 'depth'> {
  const s = useSettingsStore.getState()
  return { analyse: reviewEngine(STOCKFISH_VERSIONS[s.stockfishVersion].url), depth: Math.min(s.reviewDepth, COLORING_DEPTH) }
}

const isAbort = (e: unknown) => e instanceof Error && e.message === 'aborted'

/** A whole-book run in progress (it covers the chapter shown, so the chapter run waits). */
let bookRun = false

interface Props {
  book: number
  chapter: number
  /** The games of the chapter shown. */
  games: RecognizedGame[]
  /** Every chapter of the book, in order. */
  chapters: number[]
  loadChapterGames: (chapter: number) => Promise<RecognizedGame[]>
}

const buttonClass = (on: boolean) =>
  `flex h-9 w-9 items-center justify-center rounded-lg border shadow-sm transition disabled:cursor-not-allowed disabled:opacity-40 ${
    on ? 'border-emerald-400 bg-emerald-50 text-emerald-700' : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50 hover:text-slate-900'
  }`

/**
 * Reader top bar buttons (reader-analysis-round S11): colour every move of the
 * text by its evaluation (the games of the chapter shown are rated with the
 * engine when needed), and rate every move of the whole book, with its progress
 * in the status footer; both can be cancelled there.
 */
export function EvalColoringButtons({ book, chapter, games, chapters, loadChapterGames }: Props) {
  const enabled = useEvalColoringStore((s) => s.enabled)
  const entries = useEvalColoringStore((s) => s.entries)
  const setEnabled = useEvalColoringStore((s) => s.setEnabled)
  const [runningBook, setRunningBook] = useState(false)
  const chapterRun = useRef<string | null>(null)
  /** A chapter whose run was cancelled is not started again until the colouring is switched on again. */
  const cancelled = useRef<Set<string>>(new Set())

  const unrated = games.some((g, i) => g.tree.mainline.length > 0 && !qualitiesOf(entries, book, chapter, i, g.tree))
  useEffect(() => {
    const key = `${book}:${chapter}`
    if (!enabled || !unrated || bookRun || chapterRun.current === key || cancelled.current.has(key)) return
    chapterRun.current = key
    void withProgress('Evaluating the moves of this chapter', (report, signal) =>
      evaluateChapterGames(book, chapter, games, { ...engineOptions(), signal, report }), { cancellable: true })
      .catch((e: unknown) => {
        if (isAbort(e)) cancelled.current.add(key)
        else console.warn('[EvalColoring] could not evaluate the chapter', e)
      })
      .finally(() => { if (chapterRun.current === key) chapterRun.current = null })
  }, [enabled, unrated, book, chapter, games])

  const toggle = () => {
    if (!enabled) cancelled.current.clear()
    setEnabled(!enabled)
  }

  const evaluateBook = () => {
    if (bookRun) return
    bookRun = true
    setRunningBook(true)
    cancelled.current.clear()
    setEnabled(true)
    void withProgress('Evaluating every move of the book', (report, signal) =>
      evaluateWholeBook(book, chapters, loadChapterGames, { ...engineOptions(), signal, report }), { cancellable: true })
      .catch((e: unknown) => { if (!isAbort(e)) console.warn('[EvalColoring] could not evaluate the book', e) })
      .finally(() => { bookRun = false; setRunningBook(false) })
  }

  return (
    <>
      <button type="button" onClick={toggle} aria-pressed={enabled}
        aria-label="Colour the moves by their evaluation" title="Colour the moves by their evaluation"
        className={buttonClass(enabled)}>
        <svg className="h-4 w-4" viewBox="0 0 24 24" aria-hidden="true">
          <rect x="3" y="15" width="5" height="6" rx="1" fill="#16a34a" />
          <rect x="10" y="10" width="5" height="11" rx="1" fill="#f59e0b" />
          <rect x="17" y="5" width="5" height="16" rx="1" fill="#e11d48" />
        </svg>
      </button>
      <button type="button" onClick={evaluateBook} disabled={runningBook}
        aria-label="Evaluate every move of the whole book" title="Evaluate every move of the whole book"
        className={buttonClass(runningBook)}>
        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20V3H6.5A2.5 2.5 0 0 0 4 5.5v14zM20 17v4H6.5A2.5 2.5 0 0 1 4 18.5" />
          <path strokeLinecap="round" d="M9 13l2-3 2 2 3-5" />
        </svg>
      </button>
    </>
  )
}
