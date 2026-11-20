import { findWrongMove, type RecognizedGame, type WrongMoveResult } from '@chess-ebook/chess-shared'
import { initialMoves, type EditableMove } from '../library/correction/workbench'
import { buildGameErrata, type SaveFixInput } from '../library/wrongMove/gameFix'
import { chapterGames, fetchBookChapter, gameLabel } from './bookErrors'
import { chapterHasText, loadRepoBookChapters, type RepoBook } from './repoBooks'

/** A book to search: a library book (number id) or a resources book (its manifest entry). */
export interface WrongMoveTarget {
  id: number | string
  title: string
  repo?: RepoBook
  /** Only these games (chapter numbered as the errors are); every game with errors when omitted. */
  only?: { chapter: number; gameIndex: number }[]
}

/** One game whose printed main line stops playing, with the fixes found. */
export interface WrongMoveRow {
  key: string
  bookId: number | string
  bookTitle: string
  /** The chapter as the errors number it. */
  chapter: number
  gameIndex: number
  label: string
  moves: EditableMove[]
  startFen: string
  /** The chapter text the moves' offsets point into. */
  text: string
  result: WrongMoveResult
  errataFor: SaveFixInput['errataFor']
  /** Where a 'move' suggestion is filed: the book title and the reader's chapter. */
  target: SaveFixInput['target']
}

export interface WrongMoveBatch {
  rows: WrongMoveRow[]
  /** Games with recognition errors that were searched. */
  checked: number
  stopped: boolean
}

const TOP_N = 5

interface ChapterSource { chapter: number; readerChapter: number; html: () => Promise<string> }

/** The chapters of a book to read, numbered as the errors are and as the reader opens them. */
async function chapterSources(t: WrongMoveTarget): Promise<ChapterSource[]> {
  const wanted = t.only ? new Set(t.only.map((g) => g.chapter)) : null
  if (t.repo) {
    const chapters = await loadRepoBookChapters(t.repo)
    const out: ChapterSource[] = []
    let textChapter = 0
    chapters.forEach((c, i) => {
      if (!chapterHasText(c.html)) return
      const chapter = ++textChapter
      if (!wanted || wanted.has(chapter)) out.push({ chapter, readerChapter: i + 1, html: async () => c.html })
    })
    return out
  }
  const id = t.id as number
  if (wanted) return [...wanted].sort((a, b) => a - b).map((c) => ({ chapter: c, readerChapter: c, html: async () => (await fetchBookChapter(id, c)).html }))
  // The first chapter tells how many there are.
  const first = await fetchBookChapter(id, 1)
  const total = Math.max(1, ...first.toc.map((x) => x.order))
  return Array.from({ length: total }, (_, i) => ({
    chapter: i + 1, readerChapter: i + 1,
    html: async () => (i === 0 ? first.html : (await fetchBookChapter(id, i + 1)).html),
  }))
}

function rowFor(t: WrongMoveTarget, src: ChapterSource, text: string, games: RecognizedGame[], gameIndex: number): WrongMoveRow | null {
  const game = games[gameIndex]
  const moves = initialMoves(text, game)
  if (moves.length === 0) return null
  const result = findWrongMove({ sans: moves.map((m) => m.san), startFen: game.tree.startFen, topN: TOP_N })
  if (result.failingPly === null) return null
  const book = { title: t.title, ...(typeof t.id === 'number' ? { id: t.id } : {}) }
  return {
    key: `${t.id}-${src.chapter}-${gameIndex}`,
    bookId: t.id, bookTitle: t.title, chapter: src.chapter, gameIndex, label: gameLabel(text, game),
    moves, startFen: game.tree.startFen, text, result,
    errataFor: (corrected) => buildGameErrata({ text, games, gameIndex, original: moves, book, chapter: src.readerChapter, corrected }),
    target: { book: t.title, chapter: src.readerChapter },
  }
}

/**
 * Search the games with recognition errors of some books for the wrong printed
 * move (findWrongMove of chess-shared), one chapter at a time. Nothing is saved
 * or applied: the rows only propose fixes.
 */
export async function findWrongMoves(targets: WrongMoveTarget[], report: (fraction: number) => void, signal: AbortSignal): Promise<WrongMoveBatch> {
  const rows: WrongMoveRow[] = []
  let checked = 0
  for (let b = 0; b < targets.length && !signal.aborted; b++) {
    const t = targets[b]
    const sources = await chapterSources(t)
    for (let c = 0; c < sources.length; c++) {
      if (signal.aborted) break
      const src = sources[c]
      let html: string
      try { html = await src.html() } catch { continue /* a chapter that cannot be read is skipped */ }
      if (signal.aborted) break
      const { text, games } = chapterGames(html)
      const only = t.only ? new Set(t.only.filter((g) => g.chapter === src.chapter).map((g) => g.gameIndex)) : null
      games.forEach((g, i) => {
        if (g.tree.errors.length === 0 || (only && !only.has(i))) return
        checked++
        const row = rowFor(t, src, text, games, i)
        if (row) rows.push(row)
      })
      report((b + (c + 1) / sources.length) / targets.length)
      // Let the page breathe (and a cancel land) between chapters.
      await new Promise((r) => setTimeout(r, 0))
    }
  }
  return { rows, checked, stopped: signal.aborted }
}
