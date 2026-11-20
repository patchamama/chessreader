import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useBooks } from '../library/api/libraryApi'
import { saveProgress } from '../library/store/readingStore'
import { saveBoardMemory } from '../library/store/boardMemory'
import { getJson } from '../library/commentdb/commentLookup'
import { usePageWidth } from '../../shared/layout/pageWidth'
import { withBusy } from '../../shared/layout/busyStore'
import { bookErrors, type GameErrors } from './bookErrors'
import { isDemoHost } from '../../shared/env/devMode'
import { hasResources } from '../database/resources'
import { EXTERNAL_BOOK_ID, type ExternalChapter } from '../../shared/externalBook/externalBookStore'
import { loadRepoBookChapters, loadRepoBooks, openRepoGame, repoBookErrors, type RepoBook } from './repoBooks'
import SuggestionsReview from './SuggestionsReview'
import { loadCachedErrors, saveCachedErrors, summarise, type BookErrorSummary, type ErrorsFile, type GameSummary } from './errorsSummary'

type BookId = number | string
type RankedGame = GameSummary & { bookId: BookId }

/** The most recent of two analyses of a book. */
const newest = (a: BookErrorSummary | undefined, b: BookErrorSummary): BookErrorSummary => (!a || b.analysedAt > a.analysedAt ? b : a)

const formatDate = (iso: string) => {
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? '' : d.toISOString().slice(0, 10)
}

/**
 * Recognition errors of the library: a table of the books with their games and
 * errors by kind, and the games ranked by number of errors — each opens in the
 * reader at that game, where the error panel shows the cause. The table is
 * filled from the start: in the deployed app (no server) from books/errors.json
 * of the private resources repository (scripts/build-errors.ts); on the server
 * from the remembered last analysis of each book, and the books never analysed
 * are analysed in the background, one at a time. "Analyse" refreshes.
 */
export default function ErrorsPage() {
  const width = usePageWidth('max-w-6xl')
  const [tab, setTab] = useState<'errors' | 'suggestions'>('errors')
  const tabClass = (on: boolean) => `rounded-t px-3 py-1 text-sm ${on ? 'border border-b-white border-slate-300 bg-white font-semibold' : 'text-slate-600 hover:text-slate-800'}`
  return (
    <div className={`mx-auto ${width} px-4 py-6`}>
      <div role="tablist" aria-label="Errors page" className="mb-3 flex gap-1 border-b border-slate-300">
        <button role="tab" aria-selected={tab === 'errors'} className={tabClass(tab === 'errors')} onClick={() => setTab('errors')}>Errors</button>
        <button role="tab" aria-selected={tab === 'suggestions'} className={tabClass(tab === 'suggestions')} onClick={() => setTab('suggestions')}>Suggestions</button>
      </div>
      <div role="tabpanel">
        {tab === 'errors' ? <RecognitionErrors /> : <SuggestionsReview />}
      </div>
    </div>
  )
}

/** The Errors tab: recognition errors of the library books. */
function RecognitionErrors() {
  const navigate = useNavigate()
  const repoMode = isDemoHost()
  const { data: libraryBooks } = useBooks()
  const [repoBooks, setRepoBooks] = useState<RepoBook[] | null>(null)
  const [repoError, setRepoError] = useState<string | null>(null)
  const [summaries, setSummaries] = useState<Record<string, BookErrorSummary>>({})
  const [progress, setProgress] = useState<{ book: BookId; done: number; total: number } | null>(null)
  const repoChapters = useRef(new Map<string, ExternalChapter[]>())
  const abort = useRef<AbortController | null>(null)
  const autoScanned = useRef(false)
  const books: { id: BookId; title: string }[] | undefined = repoMode ? repoBooks ?? undefined : libraryBooks

  const remember = (list: (BookErrorSummary | null | undefined)[]) =>
    setSummaries((s) => {
      const next = { ...s }
      for (const b of list) if (b) next[String(b.id)] = newest(next[String(b.id)], b)
      return next
    })

  const scan = useCallback(async (list: { id: BookId; title: string }[]) => {
    abort.current?.abort()
    const ctrl = new AbortController()
    abort.current = ctrl
    for (const { id, title } of list) {
      if (ctrl.signal.aborted) break
      const onProgress = (done: number, total: number) => setProgress({ book: id, done, total })
      let games: GameErrors[]
      if (typeof id === 'string') {
        const book = repoBooks?.find((b) => b.id === id)
        if (!book) continue
        try {
          const r = await repoBookErrors(book, onProgress, ctrl.signal)
          repoChapters.current.set(id, r.chapters)
          games = r.games
        } catch (e) {
          setRepoError(`${book.title}: ${(e as Error).message}`)
          continue
        }
      } else {
        games = await bookErrors(id, onProgress, ctrl.signal)
      }
      // A stopped analysis is partial: neither shown nor remembered.
      if (ctrl.signal.aborted) break
      const summary = summarise(id, title, games)
      saveCachedErrors(summary)
      setSummaries((s) => ({ ...s, [String(id)]: summary }))
    }
    if (abort.current === ctrl) setProgress(null)
  }, [repoBooks])

  // Stop a running analysis when leaving the page.
  useEffect(() => () => abort.current?.abort(), [])

  // Deployed app: the books of the repository and their precomputed errors.
  useEffect(() => {
    if (!repoMode || !hasResources()) return
    loadRepoBooks().then((list) => {
      setRepoBooks(list)
      remember(list.map((b) => loadCachedErrors(b.id)))
    }, (e: Error) => setRepoError(e.message))
    getJson<ErrorsFile>('books/errors.json').then((file) => remember(file.books ?? []), () => { /* not built yet: Analyse */ })
  }, [repoMode])

  // Server: the remembered analyses at once, then the books never analysed in the background.
  useEffect(() => {
    if (repoMode || !libraryBooks || autoScanned.current) return
    autoScanned.current = true
    const cached = libraryBooks.map((b) => loadCachedErrors(b.id))
    remember(cached)
    const missing = libraryBooks.filter((_, i) => !cached[i])
    if (missing.length) void scan(missing)
  }, [repoMode, libraryBooks, scan])

  const open = async (g: RankedGame) => {
    if (typeof g.bookId === 'string') {
      const book = repoBooks?.find((b) => b.id === g.bookId)
      if (!book) return
      let chapters = repoChapters.current.get(book.id)
      if (!chapters) {
        try {
          chapters = await withBusy(`Opening ${book.title}…`, () => loadRepoBookChapters(book))
        } catch (e) {
          setRepoError(`${book.title}: ${(e as Error).message}`)
          return
        }
        repoChapters.current.set(book.id, chapters)
      }
      openRepoGame(book, chapters, g)
      navigate(`/read/${EXTERNAL_BOOK_ID}`)
      return
    }
    saveProgress(g.bookId, g.chapter)
    saveBoardMemory(g.bookId, { chapter: g.chapter, gameIndex: g.gameIndex, nodeId: null, annotations: {} })
    navigate(`/read/${g.bookId}`)
  }

  const shown = (books ?? []).map((b) => summaries[String(b.id)]).filter((s): s is BookErrorSummary => !!s)
  const ranking: RankedGame[] = shown
    .flatMap((s) => s.perGame.map((g) => ({ ...g, bookId: s.id })))
    .sort((a, b) => b.errors - a.errors)
    .slice(0, 100)
  const totals = shown.reduce((t, s) => ({ games: t.games + s.games, errors: t.errors + s.errors }), { games: 0, errors: 0 })
  const title = (id: BookId) => books?.find((b) => b.id === id)?.title ?? `#${id}`
  const cell = 'border-t border-slate-100 px-2 py-1'
  return (
    <div>
      <h1 className="text-xl font-bold text-slate-800">Recognition errors</h1>
      {repoMode && !hasResources() && (
        <p className="mt-2 text-sm text-slate-600">Set the resources repository and its GitHub token in Settings to see the errors of the books.</p>
      )}
      {repoError && <p role="alert" className="mt-2 text-sm text-red-600">Could not read the resources: {repoError}</p>}
      <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
        <button className="rounded bg-blue-600 px-3 py-1 text-white disabled:opacity-50" disabled={!books?.length || !!progress} onClick={() => void scan(books ?? [])}>Analyse every book</button>
        {progress && (
          <>
            <span role="status" className="text-xs text-slate-600">{title(progress.book)}: chapter {progress.done}/{progress.total}</span>
            <button className="text-xs underline" onClick={() => abort.current?.abort()}>Stop</button>
          </>
        )}
        {shown.length > 0 && (
          <span className="text-xs text-slate-500">
            {shown.length}/{books?.length ?? 0} books analysed · {totals.games} games · {totals.errors} errors
            {totals.games ? ` · ${(totals.errors / totals.games).toFixed(2)} per game` : ''}
          </span>
        )}
      </div>
      <table className="mt-3 w-full text-xs" aria-label="Books with errors">
        <thead><tr className="text-left text-slate-500"><th className="px-2">Book</th><th>Games</th><th>Errors</th><th>Errors per game</th><th>By kind</th><th>Analysed</th><th /></tr></thead>
        <tbody>
          {(books ?? []).map((b) => {
            const s = summaries[String(b.id)]
            return (
              <tr key={b.id}>
                <td className={cell}>{b.title}</td>
                <td className={cell}>{s ? s.games : '—'}</td>
                <td className={cell}>{s ? s.errors : '—'}</td>
                <td className={cell}>{s && s.games ? (s.errors / s.games).toFixed(2) : '—'}</td>
                <td className={cell}>{s ? Object.entries(s.byKind).sort((x, y) => y[1] - x[1]).map(([k, n]) => `${k} ${n}`).join(', ') : ''}</td>
                <td className={cell}>{s ? formatDate(s.analysedAt) : ''}</td>
                <td className={cell}><button className="underline" disabled={!!progress} onClick={() => void scan([b])}>Analyse</button></td>
              </tr>
            )
          })}
        </tbody>
      </table>
      {ranking.length > 0 && (
        <>
          <h2 className="mt-6 text-sm font-semibold">Games with most errors</h2>
          <table className="mt-1 w-full text-xs" aria-label="Games with most errors">
            <thead><tr className="text-left text-slate-500"><th className="px-2">#</th><th>Book</th><th>Chapter</th><th>Game</th><th>Moves</th><th>Errors</th><th /></tr></thead>
            <tbody>
              {ranking.map((g, i) => (
                <tr key={`${g.bookId}-${g.chapter}-${g.gameIndex}`}>
                  <td className={cell}>{i + 1}</td><td className={cell}>{title(g.bookId)}</td><td className={cell}>{g.chapter}</td>
                  <td className={cell}>{g.label}</td><td className={cell}>{g.moves}</td>
                  <td className={cell} title={g.messages.join('\n')}>{g.errors}</td>
                  <td className={cell}><button className="rounded border border-slate-300 px-2 py-0.5" onClick={() => void open(g)}>Open</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </div>
  )
}
