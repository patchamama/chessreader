import { useCallback, useEffect, useState } from 'react'
import GeneratedPgnDetail from './GeneratedPgnDetail'
import { generatedPgnApi, type GeneratedPgnBook, type GeneratedPgnClient, type GeneratedPgnItem, type GeneratedPgnSummary, type PgnStatus } from './generatedPgnApi'

const STATUSES: PgnStatus[] = ['new', 'reviewed', 'rejected']
const BADGE: Record<PgnStatus, string> = { new: 'bg-blue-100 text-blue-800', reviewed: 'bg-emerald-100 text-emerald-800', rejected: 'bg-slate-200 text-slate-600' }

/** Database → Generated PGN: the PGN made from book games, to review, accept or reject, download, or add to a Lichess study. */
export default function GeneratedPgnTab({ client = generatedPgnApi }: { client?: GeneratedPgnClient }) {
  const [items, setItems] = useState<GeneratedPgnSummary[] | null>(null)
  const [books, setBooks] = useState<GeneratedPgnBook[]>([])
  const [book, setBook] = useState('')
  const [status, setStatus] = useState<'' | PgnStatus>('')
  const [text, setText] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [open, setOpen] = useState<GeneratedPgnItem | null>(null)

  const load = useCallback(async () => {
    try {
      const r = await client.list({ ...(book ? { bookId: Number(book) } : {}), ...(status ? { status } : {}), ...(text.trim() ? { q: text.trim() } : {}) })
      setItems(r.items)
      setBooks(r.books)
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }, [client, book, status, text])
  useEffect(() => { void load() }, [load])

  const show = async (id: number) => {
    try { setOpen(await client.get(id)) } catch (e) { setError(e instanceof Error ? e.message : String(e)) }
  }
  const remove = async (item: GeneratedPgnItem) => {
    if (!window.confirm(`Delete the generated PGN ${item.white || '?'} – ${item.black || '?'}?`)) return
    try {
      await client.remove(item.id)
      setOpen(null)
      await load()
    } catch (e) { setError(e instanceof Error ? e.message : String(e)) }
  }
  const changed = (item: GeneratedPgnItem) => {
    setOpen(item)
    const summary: GeneratedPgnSummary & { pgn?: string } = { ...item }
    delete summary.pgn
    setItems((rows) => rows?.map((r) => (r.id === item.id ? summary : r)) ?? rows)
  }
  const field = 'rounded border border-slate-300 px-1 text-xs'

  return (
    <section aria-label="Generated PGN" className="text-sm">
      <p className="text-xs text-slate-600">PGN generated from the games of your library books (reader or library: “PGN”). Review them here, then download them or add them to a Lichess study.</p>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <select aria-label="Filter by book" className={field} value={book} onChange={(e) => setBook(e.target.value)}>
          <option value="">All books</option>
          {books.map((b) => <option key={b.bookId} value={b.bookId}>{b.bookTitle} ({b.count})</option>)}
        </select>
        <select aria-label="Filter by status" className={field} value={status} onChange={(e) => setStatus(e.target.value as '' | PgnStatus)}>
          <option value="">Any status</option>
          {STATUSES.map((s) => <option key={s} value={s}>{s[0].toUpperCase() + s.slice(1)}</option>)}
        </select>
        <input aria-label="Search players or event" placeholder="Search players, event…" className={field} value={text} onChange={(e) => setText(e.target.value)} />
      </div>
      {error && <p role="alert" className="mt-2 text-xs text-red-600">{error}</p>}
      {items && items.length === 0 && !error && <p className="mt-3 text-xs text-slate-500">No generated PGN yet.</p>}
      {items && items.length > 0 && (
        <table aria-label="Generated games" className="mt-2 w-full text-xs">
          <thead><tr className="text-left text-slate-500"><th>Book</th><th>Ch.</th><th>#</th><th>White</th><th>Black</th><th>Result</th><th>Status</th><th /></tr></thead>
          <tbody>
            {items.map((i) => (
              <tr key={i.id} className={`border-t border-slate-100 ${open?.id === i.id ? 'bg-amber-50' : ''}`}>
                <td>{i.bookTitle}</td><td>{i.chapter}</td><td>{i.gameIndex + 1}</td><td>{i.white || '?'}</td><td>{i.black || '?'}</td><td>{i.result}</td>
                <td><span className={`rounded px-1 ${BADGE[i.status]}`}>{i.status}</span></td>
                <td><button type="button" className="text-blue-700 underline" aria-label={`Open ${i.white || '?'} - ${i.black || '?'} (chapter ${i.chapter}, game ${i.gameIndex + 1})`} onClick={() => void show(i.id)}>Open</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {open && <GeneratedPgnDetail key={open.id} item={open} client={client} canWrite={open.canWrite} onChange={changed} onDelete={() => void remove(open)} />}
    </section>
  )
}
