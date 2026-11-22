import { useEffect, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { recognizeGames } from '@chess-ebook/chess-shared'
import { httpClient } from '../../../../shared/api/httpClient'
import { EXTERNAL_BOOK_ID, useExternalBookStore } from '../../../../shared/externalBook/externalBookStore'
import type { Chapter, ChapterTocEntry } from '../../api/libraryApi'
import { describeGames, type GameSummary } from '../../utils/gameMarkers'
import { htmlToProseText } from '../../utils/proseText'
import { formatChapterTitle } from '../../utils/epubContent'
import { useSettingsStore } from '../../../../shared/settings/settingsStore'

type Tab = 'chapters' | 'games'
type RecognitionAlgorithm = 1 | 2

interface ReaderTocProps {
  bookId: number
  toc: ChapterTocEntry[]
  currentChapter: number
  /** The games of the chapter on screen (already recognised by the reader). */
  currentGames: GameSummary[]
  algorithm: RecognitionAlgorithm
  onChapter: (order: number) => void
  onGame: (chapter: number, index: number) => void
}

async function fetchChapter(bookId: number, order: number): Promise<Chapter> {
  if (bookId === EXTERNAL_BOOK_ID) {
    const chapter = useExternalBookStore.getState().chapters[order - 1]
    if (!chapter) throw new Error('Chapter not found')
    return chapter
  }
  return httpClient<Chapter>(`/api/library/books/${bookId}/chapters/${order}`)
}

/** The games of another chapter, recognised once when its list is opened (cached per chapter). */
function useChapterGames(bookId: number, order: number, algorithm: RecognitionAlgorithm, enabled: boolean) {
  return useQuery<GameSummary[]>({
    queryKey: ['library', 'chapter-games', bookId, order, algorithm],
    queryFn: async () => {
      const chapter = await fetchChapter(bookId, order)
      const text = htmlToProseText(chapter.html)
      return describeGames(text, recognizeGames(text, { algorithm }))
    },
    enabled,
    staleTime: Infinity,
  })
}

function GameList({ games, onPick }: { games: GameSummary[]; onPick: (index: number) => void }) {
  if (games.length === 0) return <p className="px-3 py-1 text-xs italic text-slate-400">No games</p>
  return (
    <ul className="space-y-0.5">
      {games.map((g) => (
        <li key={g.index}>
          <button
            type="button"
            onClick={() => onPick(g.index)}
            className="w-full rounded-md px-3 py-1 text-left text-xs text-slate-700 transition hover:bg-slate-50"
          >
            {g.title}
          </button>
        </li>
      ))}
    </ul>
  )
}

function ChapterGames({
  bookId, entry, current, currentGames, algorithm, onGame,
}: {
  bookId: number
  entry: ChapterTocEntry
  current: boolean
  currentGames: GameSummary[]
  algorithm: RecognitionAlgorithm
  onGame: (chapter: number, index: number) => void
}) {
  const [open, setOpen] = useState(current)
  const separator = useSettingsStore((s) => s.chapterTitleSeparator)
  const { data, isLoading, isError } = useChapterGames(bookId, entry.order, algorithm, open && !current)
  const games = current ? currentGames : data
  return (
    <li>
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className={`flex w-full items-center gap-1 rounded-md px-2 py-1.5 text-left text-sm transition hover:bg-slate-50 ${
          current ? 'font-semibold text-blue-700' : 'text-slate-700'
        }`}
      >
        <span aria-hidden="true" className="text-[0.7em] text-slate-400">{open ? '▾' : '▸'}</span>
        <span className="truncate">{formatChapterTitle(entry.title, separator)}</span>
      </button>
      {open && (
        <div className="ml-3 border-l border-slate-100 pl-1">
          {games ? (
            <GameList games={games} onPick={(index) => onGame(entry.order, index)} />
          ) : isError ? (
            <p className="px-3 py-1 text-xs text-red-500">Could not read this chapter</p>
          ) : isLoading ? (
            <p className="px-3 py-1 text-xs text-slate-400">Reading games…</p>
          ) : null}
        </div>
      )}
    </li>
  )
}

/**
 * The book's table of contents with two tabs: its chapters, and the games of
 * each chapter (from the headings the reader recognises). It stays open while
 * navigating; the reader decides where it is shown.
 */
export function ReaderToc({ bookId, toc, currentChapter, currentGames, algorithm, onChapter, onGame }: ReaderTocProps) {
  const [tab, setTab] = useState<Tab>('chapters')
  const separator = useSettingsStore((s) => s.chapterTitleSeparator)
  // The current chapter stays visible in the list when it changes (next/previous buttons, links).
  const currentRef = useRef<HTMLButtonElement | null>(null)
  useEffect(() => {
    if (tab === 'chapters') currentRef.current?.scrollIntoView?.({ block: 'nearest', behavior: 'smooth' })
  }, [currentChapter, tab])
  const tabClass = (t: Tab) =>
    `flex-1 rounded-md px-3 py-1 text-xs font-semibold transition ${
      tab === t ? 'bg-white text-blue-700 shadow-sm' : 'text-slate-500 hover:text-slate-800'
    }`
  return (
    <div className="flex h-full flex-col">
      <div role="tablist" aria-label="Table of contents view" className="m-3 mb-2 flex gap-1 rounded-lg bg-slate-100 p-1">
        <button type="button" role="tab" aria-selected={tab === 'chapters'} onClick={() => setTab('chapters')} className={tabClass('chapters')}>
          Chapters
        </button>
        <button type="button" role="tab" aria-selected={tab === 'games'} onClick={() => setTab('games')} className={tabClass('games')}>
          Games
        </button>
      </div>
      <div role="tabpanel" className="min-h-0 flex-1 overflow-y-auto px-3 pb-3">
        {tab === 'chapters' ? (
          <ul className="space-y-0.5">
            {toc.map((entry) => (
              <li key={entry.order}>
                <button
                  type="button"
                  onClick={() => onChapter(entry.order)}
                  ref={entry.order === currentChapter ? currentRef : undefined}
                  aria-current={entry.order === currentChapter ? 'true' : undefined}
                  className={`w-full rounded-md px-3 py-1.5 text-left text-sm transition ${
                    entry.order === currentChapter ? 'bg-blue-50 font-semibold text-blue-700' : 'text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  {formatChapterTitle(entry.title, separator)}
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <ul className="space-y-0.5">
            {toc.map((entry) => (
              <ChapterGames
                key={entry.order}
                bookId={bookId}
                entry={entry}
                current={entry.order === currentChapter}
                currentGames={currentGames}
                algorithm={algorithm}
                onGame={onGame}
              />
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
