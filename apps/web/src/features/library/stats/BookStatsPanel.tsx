import { useEffect, useState } from 'react'
import { Link, useInRouterContext } from 'react-router-dom'
import { withProgress } from '../../../shared/layout/busyStore'
import { APP_VERSION } from '../../../version'
import { loadRepoBookChapters } from '../../errors/repoBooks'
import { computeBookStats, computeChaptersStats, loadBookStats, saveBookStats, type BookStats } from './bookStats'

const ITEMS: { key: 'games' | 'plies' | 'variations' | 'comments' | 'errors'; icon: string; label: string; hint: string }[] = [
  { key: 'games', icon: '♞', label: 'Games found', hint: 'Games found in the book' },
  { key: 'plies', icon: '♙', label: 'Main-line moves', hint: 'Moves (plies) of the main lines of all the games' },
  { key: 'variations', icon: '⑂', label: 'Variations', hint: 'Variations (side lines) of the games' },
  { key: 'comments', icon: '💬', label: 'Comments', hint: 'Comments of the commentary database written into the book' },
  { key: 'errors', icon: '⚠', label: 'Recognition errors', hint: 'Moves the recogniser could not read' },
]

/**
 * The numbers of a book behind a "details" button (nothing is computed until
 * asked): the stored ones when there are, else they are computed — chapter by
 * chapter, with the progress in the status footer — and saved. ↻ computes again.
 */
export default function BookStatsPanel({ bookId, title }: { bookId: number | string; title: string }) {
  const [open, setOpen] = useState(false)
  // Numbers already computed are shown at once: the details button is only for a book never analysed.
  useEffect(() => {
    let live = true
    void loadBookStats(bookId, title).then((stored) => { if (live && stored) { setStats(stored); setOpen(true) } }, () => undefined)
    return () => { live = false }
  }, [bookId, title])
  const [stats, setStats] = useState<BookStats | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const inRouter = useInRouterContext()

  const compute = async () => {
    setBusy(true)
    setError(null)
    try {
      const fresh = await withProgress(`Analysing ${title}…`, async (report, signal) => (typeof bookId === 'number'
        ? computeBookStats(bookId, title, report, signal)
        : computeChaptersStats(await loadRepoBookChapters({ id: bookId, title }), bookId, title, report, signal)), { cancellable: true })
      if (fresh) {
        setStats(fresh)
        await saveBookStats(bookId, fresh, title)
      }
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const show = async () => {
    setOpen(true)
    setBusy(true)
    setError(null)
    const stored = await loadBookStats(bookId, title).catch(() => null)
    setBusy(false)
    if (stored) setStats(stored)
    else await compute()
  }

  const button = 'rounded border border-slate-300 px-1.5 py-0.5 text-xs text-slate-600 hover:bg-slate-50 disabled:opacity-40'
  return (
    <div className="text-xs">
      {!open ? (
        <button type="button" className={button} aria-label="Show book details" title="Show the numbers of this book (games, moves, variations, comments, errors)" onClick={() => void show()}>ⓘ Details</button>
      ) : (
        <div className="flex flex-wrap items-center gap-2 text-slate-700">
          {stats && ITEMS.map((i) => {
            const inner = <><span aria-hidden="true">{i.icon}</span><span>{stats[i.key]}</span></>
            // The comments open the database's Comments tab, filtered by this book.
            return i.key === 'comments' && inRouter
              ? <Link key={i.key} to={`/database?tab=comments&book=${encodeURIComponent(title)}`} aria-label={`${i.label}: ${stats[i.key]}`} title={`${i.hint}: ${stats[i.key]}. Open them in Database → Comments`} className="inline-flex items-center gap-0.5 text-blue-700 underline decoration-dotted">{inner}</Link>
              : <span key={i.key} aria-label={`${i.label}: ${stats[i.key]}`} title={`${i.hint}: ${stats[i.key]}`} className="inline-flex items-center gap-0.5">{inner}</span>
          })}
          <button type="button" className={button} disabled={busy} aria-label="Refresh book details" title={stats ? `Compute again (last: ${stats.analysedAt.slice(0, 10)}${stats.version !== APP_VERSION ? `, by version ${stats.version}` : ''})` : 'Compute'} onClick={() => void compute()}>↻</button>
          <button type="button" className={button} aria-label="Hide book details" title="Hide" onClick={() => setOpen(false)}>✕</button>
        </div>
      )}
      {error && <p role="alert" className="mt-1 text-red-700">{error}</p>}
    </div>
  )
}
