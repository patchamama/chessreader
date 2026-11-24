import { useEffect, useRef } from 'react'
import type { GameTree } from '@chess-ebook/chess-shared'
import { useSettingsStore, type AppLanguage } from '../../../shared/settings/settingsStore'
import BookReader from '../components/BookReader'
import { useBookTitle } from '../api/libraryApi'
import { StudyBoard } from '../components/StudyBoard'
import { useStudyBoardStore } from '../store/studyBoardStore'
import {
  activateAnalysisBoard, closeAnalysisBoard, newAnalysisBoard, updateAnalysisWork, updateScratchWork, useAnalysisBoards,
  type AnalysisBoard, type AnalysisWork,
} from './analysisBoards'
import { lineOfBoard } from './analysisGame'
import { AnalysisMoveList } from './AnalysisMoveList'
import { AnalysisCommentsOption, AnalysisWorkspace, EMPTY_WORK } from './AnalysisWorkspace'
import { EXTERNAL_BOOK_ID } from '../../../shared/externalBook/externalBookStore'
import { closeBookTab, closeExternalTab, selectTab, useReaderTabs, type ExternalTab } from './readerTabs'
import { useStudyNavigation } from '../hooks/useStudyNavigation'

const T: Record<AppLanguage, { title: string; current: string; close: string; moves: string; add: string; analysis: string; book: string }> = {
  en: { title: 'Analysis boards', current: 'Current board', close: 'Close', moves: 'Moves', add: 'New analysis board', analysis: 'Analysis', book: 'Book' },
  es: { title: 'Tableros de análisis', current: 'Tablero actual', close: 'Cerrar', moves: 'Jugadas', add: 'Nuevo tablero de análisis', analysis: 'Análisis', book: 'Libro' },
  de: { title: 'Analysebretter', current: 'Aktuelles Brett', close: 'Schließen', moves: 'Züge', add: 'Neues Analysebrett', analysis: 'Analyse', book: 'Buch' },
}

/** What a board opened from a book starts with: its line, at the move it was opened on. */
function initialWork(board: AnalysisBoard): AnalysisWork {
  const line = lineOfBoard(board)
  return { ...EMPTY_WORK, ...line, ply: Math.max(0, Math.min(board.ply ?? line.moves.length, line.moves.length)) }
}

/** What a tab is called: the book (or source) the board comes from, else its own title. */
const tabName = (b: AnalysisBoard) => b.source?.trim() || b.title

/** The tab of an open book: its title (or "Book N" until it is known), with a ✕ that closes it. */
function BookTab({ bookId, on, label, closeLabel, tab, box }: { bookId: number; on: boolean; label: string; closeLabel: string; tab: string; box: string }) {
  const title = useBookTitle(bookId) || `${label} ${bookId}`
  return (
    <span className={box}>
      <button type="button" role="tab" aria-selected={on} title={title} className={tab} onClick={() => selectTab({ type: 'book', bookId })}>
        {title}
      </button>
      <button
        type="button"
        aria-label={`${closeLabel} ${title}`}
        className="px-1.5 text-xs text-slate-400 hover:text-red-600"
        onClick={() => closeBookTab(bookId)}
      >
        ✕
      </button>
    </span>
  )
}

/** The tab of a game or study opened from outside: the title of its book, with a ✕ that closes it. */
function ExternalTabButton({ ext, on, closeLabel, tab, box }: { ext: ExternalTab; on: boolean; closeLabel: string; tab: string; box: string }) {
  const title = ext.snapshot.title || 'Game'
  return (
    <span className={box}>
      <button type="button" role="tab" aria-selected={on} title={title} className={tab} onClick={() => selectTab({ type: 'external', tabId: ext.tabId })}>
        {title}
      </button>
      <button type="button" aria-label={`${closeLabel} ${title}`} className="px-1.5 text-xs text-slate-400 hover:text-red-600" onClick={() => closeExternalTab(ext.tabId)}>
        ✕
      </button>
    </span>
  )
}

/** The moves leading to the current node, then the rest of its line (main line or variation). */
function shownLine(tree: GameTree, currentId: string | null): string[] {
  if (!currentId || tree.mainline.includes(currentId)) return tree.mainline
  const path: string[] = []
  for (let id: string | null = currentId; id; id = tree.nodes.get(id)?.parentId ?? null) path.unshift(id)
  for (const lines of tree.variations.values()) {
    const line = lines.find((l) => l.includes(currentId))
    if (line) return [...path, ...line.slice(line.indexOf(currentId) + 1)]
  }
  return path
}

/** The study board's game, as a clickable list of moves; a click moves the (same, live) board there. */
function CurrentGameMoves({ label, tree }: { label: string; tree: GameTree }) {
  const currentId = useStudyBoardStore((s) => s.currentNodeId)
  const setCurrentNode = useStudyBoardStore((s) => s.setCurrentNode)
  return (
    <AnalysisMoveList
      label={label} tree={tree} ids={shownLine(tree, currentId)} currentId={currentId}
      onSelect={(id) => setCurrentNode(id, !tree.mainline.includes(id))}
    />
  )
}

/** The comments of the position of the study board (the game's move shown, or the one played freely on it). */
function CurrentBoardComments() {
  const nav = useStudyNavigation()
  const playFen = useStudyBoardStore((s) => s.playFen)
  return <AnalysisCommentsOption fen={playFen ?? nav.fen} />
}

/**
 * The "Analysis board" tab (S11, S10): the current analysis board first — the
 * study board of the reader, live, with its game's moves and all its controls,
 * or, while no game of a book is open, a free board to play or type a game on —
 * then one closable tab per extra analysis board (named after its book) and a
 * "+" that opens a new, empty one. Every board keeps what was done on it.
 */
export default function AnalysisPage() {
  const { boards, active, scratch } = useAnalysisBoards()
  const studyGame = useStudyBoardStore((s) => s.activeGame)
  const lang = useSettingsStore((s) => s.language)
  const t = T[lang] ?? T.en
  const { books, externals, selected } = useReaderTabs()
  // A board just opened (or brought to the front elsewhere) is the one shown,
  // unless a book is being read: its own boards open in the floating panel.
  const lastActive = useRef(active)
  useEffect(() => {
    if (lastActive.current === active) return
    lastActive.current = active
    if (active !== null && useReaderTabs.getState().selected.type !== 'book') selectTab({ type: 'board', id: active })
  }, [active])
  const bookId = selected.type === 'book' ? selected.bookId : selected.type === 'external' ? EXTERNAL_BOOK_ID : null
  const readerKey = selected.type === 'external' ? `external-${selected.tabId}` : String(bookId)
  const board = selected.type === 'board' ? boards.find((b) => b.id === selected.id) ?? null : null
  const tab = 'max-w-[14rem] truncate px-3 py-1.5 text-sm font-medium text-slate-700'
  const tabBox = (on: boolean) => `flex shrink-0 items-center rounded-t border-b-2 ${on ? 'border-emerald-600 bg-emerald-50' : 'border-transparent hover:bg-slate-50'}`

  return (
    <section className={`flex flex-col gap-3 ${bookId !== null ? 'min-h-0 flex-1' : ''}`} data-testid="analysis-page">
      <div role="tablist" aria-label={t.title} className="flex shrink-0 gap-1 overflow-x-auto border-b border-slate-200">
        <span className={tabBox(!board && bookId === null)}>
          <button type="button" role="tab" aria-selected={!board && bookId === null} className={tab} onClick={() => selectTab({ type: 'current' })}>
            {t.current}
          </button>
        </span>
        {boards.map((b) => (
          <span key={b.id} className={tabBox(board?.id === b.id)}>
            <button
              type="button"
              role="tab"
              aria-selected={board?.id === b.id}
              title={b.source && b.source !== b.title ? `${b.source} — ${b.title}` : b.title}
              className={tab}
              onClick={() => { activateAnalysisBoard(b.id); selectTab({ type: 'board', id: b.id }) }}
            >
              {tabName(b)}
            </button>
            <button
              type="button"
              aria-label={`${t.close} ${tabName(b)}`}
              className="px-1.5 text-xs text-slate-400 hover:text-red-600"
              onClick={() => closeAnalysisBoard(b.id)}
            >
              ✕
            </button>
          </span>
        ))}
        {externals.map((ext) => {
          const on = selected.type === 'external' && selected.tabId === ext.tabId
          return <ExternalTabButton key={`external-${ext.tabId}`} ext={ext} on={on} closeLabel={t.close} tab={tab} box={tabBox(on)} />
        })}
        {books.map((b) => (
          <BookTab key={`book-${b.bookId}`} bookId={b.bookId} on={bookId === b.bookId} label={t.book} closeLabel={t.close} tab={tab} box={tabBox(bookId === b.bookId)} />
        ))}
        <button
          type="button"
          aria-label={t.add}
          title={t.add}
          className="shrink-0 rounded-t px-3 py-1.5 text-base font-semibold text-slate-500 hover:bg-slate-50 hover:text-emerald-700"
          onClick={() => {
            const used = new Set(boards.map((b) => b.title))
            let n = 1
            while (used.has(`${t.analysis} ${n}`)) n++
            selectTab({ type: 'board', id: newAnalysisBoard(`${t.analysis} ${n}`) })
          }}
        >
          +
        </button>
      </div>
      <div role="tabpanel" className={bookId !== null ? 'flex min-h-0 flex-1 flex-col' : undefined}>
        {bookId !== null ? (
          // Only the shown book keeps a reader mounted: they share the study board.
          <BookReader key={readerKey} bookId={bookId} />
        ) : board ? (
          <AnalysisWorkspace
            key={board.id}
            title={tabName(board)}
            work={board.work ?? initialWork(board)}
            onChange={(work) => updateAnalysisWork(board.id, work)}
            comment={board.text}
            source={board.source}
          />
        ) : studyGame ? (
          <div className="grid items-start gap-4 md:grid-cols-[minmax(0,480px)_1fr]">
            <StudyBoard />
            <div className="flex min-w-0 flex-col gap-3">
              <CurrentGameMoves label={t.moves} tree={studyGame} />
              <CurrentBoardComments />
            </div>
          </div>
        ) : (
          <AnalysisWorkspace title={t.current} work={scratch ?? EMPTY_WORK} onChange={updateScratchWork} />
        )}
      </div>
    </section>
  )
}
