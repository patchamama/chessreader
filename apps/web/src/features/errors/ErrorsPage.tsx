import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useBooks } from '../library/api/libraryApi'
import { saveProgress } from '../library/store/readingStore'
import { saveBoardMemory } from '../library/store/boardMemory'
import { usePageWidth } from '../../shared/layout/pageWidth'
import { bookErrors, errorKinds, type GameErrors } from './bookErrors'
import { isDemoHost } from '../../shared/env/devMode'
import { hasResources } from '../database/resources'
import { EXTERNAL_BOOK_ID, type ExternalChapter } from '../../shared/externalBook/externalBookStore'
import { loadRepoBooks, openRepoGame, repoBookErrors, type RepoBook } from './repoBooks'

/**
 * Recognition errors of the library: a table of the books with their games and
 * errors by kind, and the games ranked by number of errors — each opens in the
 * reader at that game, where the error panel shows the cause. In the deployed
 * app (no server) the books come from the private resources repository when its
 * GitHub token is set in Settings.
 */
export default function ErrorsPage() {
  const width = usePageWidth('max-w-6xl')
  const navigate = useNavigate()
  const repoMode = isDemoHost()
  const { data: libraryBooks } = useBooks()
  const [repoBooks, setRepoBooks] = useState<RepoBook[] | null>(null)
  const [repoError, setRepoError] = useState<string | null>(null)
  const repoChapters = useRef(new Map<string, ExternalChapter[]>())
  useEffect(() => {
    if (!repoMode || !hasResources()) return
    loadRepoBooks().then(setRepoBooks, (e: Error) => setRepoError(e.message))
  }, [repoMode])
  const books: { id: number | string; title: string }[] | undefined = repoMode ? repoBooks ?? undefined : libraryBooks
  const [results, setResults] = useState<Record<string, GameErrors[]>>({})
  const [progress, setProgress] = useState<{ book: number | string; done: number; total: number } | null>(null)
  const abort = useRef<AbortController | null>(null)

  const scan = async (ids: (number | string)[]) => {
    abort.current?.abort()
    const ctrl = new AbortController()
    abort.current = ctrl
    for (const id of ids) {
      if (ctrl.signal.aborted) break
      const onProgress = (done: number, total: number) => setProgress({ book: id, done, total })
      let games: GameErrors[] = []
      if (typeof id === 'string') {
        const book = repoBooks?.find((b) => b.id === id)
        if (!book) continue
        try {
          const r = await repoBookErrors(book, onProgress, ctrl.signal)
          repoChapters.current.set(id, r.chapters)
          games = r.games
        } catch (e) { setRepoError(`${book.title}: ${(e as Error).message}`) }
      } else {
        games = await bookErrors(id, onProgress, ctrl.signal)
      }
      setResults((r) => ({ ...r, [String(id)]: games }))
    }
    setProgress(null)
  }
  const open = (g: GameErrors) => {
    if (typeof g.bookId === 'string') {
      const book = repoBooks?.find((b) => b.id === g.bookId)
      const chapters = repoChapters.current.get(g.bookId)
      if (!book || !chapters) return
      openRepoGame(book, chapters, g)
      navigate(`/read/${EXTERNAL_BOOK_ID}`)
      return
    }
    saveProgress(g.bookId, g.chapter)
    saveBoardMemory(g.bookId, { chapter: g.chapter, gameIndex: g.gameIndex, nodeId: null, annotations: {} })
    navigate(`/read/${g.bookId}`)
  }
  const ranking = Object.values(results).flat().filter((g) => g.errors.length > 0).sort((a, b) => b.errors.length - a.errors.length).slice(0, 100)
  const title = (id: number | string) => books?.find((b) => b.id === id)?.title ?? `#${id}`
  const cell = 'border-t border-slate-100 px-2 py-1'
  return (
    <div className={`mx-auto ${width} px-4 py-6`}>
      <h1 className="text-xl font-bold text-slate-800">Recognition errors</h1>
      {repoMode && !hasResources() && (
        <p className="mt-2 text-sm text-slate-600">Set the resources repository and its GitHub token in Settings to see the errors of the books.</p>
      )}
      {repoError && <p role="alert" className="mt-2 text-sm text-red-600">Could not read the resources: {repoError}</p>}
      <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
        <button className="rounded bg-blue-600 px-3 py-1 text-white disabled:opacity-50" disabled={!books?.length || !!progress} onClick={() => void scan((books ?? []).map((b) => b.id))}>Analyse every book</button>
        {progress && (
          <>
            <span role="status" className="text-xs text-slate-600">{title(progress.book)}: chapter {progress.done}/{progress.total}</span>
            <button className="text-xs underline" onClick={() => abort.current?.abort()}>Stop</button>
          </>
        )}
      </div>
      <table className="mt-3 w-full text-xs" aria-label="Books with errors">
        <thead><tr className="text-left text-slate-500"><th className="px-2">Book</th><th>Games</th><th>Errors</th><th>Errors per game</th><th>By kind</th><th /></tr></thead>
        <tbody>
          {(books ?? []).map((b) => {
            const r = results[String(b.id)]
            const errors = r?.reduce((s, g) => s + g.errors.length, 0) ?? 0
            return (
              <tr key={b.id}>
                <td className={cell}>{b.title}</td>
                <td className={cell}>{r ? r.length : '—'}</td>
                <td className={cell}>{r ? errors : '—'}</td>
                <td className={cell}>{r && r.length ? (errors / r.length).toFixed(2) : '—'}</td>
                <td className={cell}>{r ? Object.entries(errorKinds(r)).map(([k, n]) => `${k} ${n}`).join(', ') : ''}</td>
                <td className={cell}><button className="underline" disabled={!!progress} onClick={() => void scan([b.id])}>Analyse</button></td>
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
                  <td className={cell} title={g.errors.slice(0, 5).map((e) => e.message).join('\n')}>{g.errors.length}</td>
                  <td className={cell}><button className="rounded border border-slate-300 px-2 py-0.5" onClick={() => open(g)}>Open</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </div>
  )
}
