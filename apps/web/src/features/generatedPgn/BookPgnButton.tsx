import { useRef, useState } from 'react'
import { generateBookGames, bookChapterOrders, gameFileName, joinPgns, serverChapterLoader, type ChapterLoader } from './bookGames'
import { saveFile } from './download'
import { generatedPgnApi, type GeneratedPgnClient } from './generatedPgnApi'
import type { GeneratedGame } from './gamePgn'
import { zipStored } from './zip'

export interface BookPgnButtonProps {
  bookId: number
  bookTitle: string | null
  author?: string | null
  /** The chapter being read: the "this chapter" scope. */
  chapter: number
  /** Every chapter of the book, in order; looked up from the table of contents when missing. */
  chapters?: number[]
  titleSeparator?: string
  algorithm?: 1 | 2
  /** 'icon' (reader toolbar, default) or 'link' (library card). */
  variant?: 'icon' | 'link'
  /** The scope offered first; the library starts with the whole book. */
  defaultScope?: 'chapter' | 'book'
  /** Faked in tests. */
  client?: GeneratedPgnClient
  loadChapter?: ChapterLoader
  save?: typeof saveFile
}

type Scope = 'chapter' | 'book'
type Action = 'file' | 'zip' | 'review'

const safeName = (s: string) => s.replace(/[\\/:*?"<>|]+/g, '').replace(/\s+/g, ' ').trim().slice(0, 60) || 'book'
const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? '' : 's'}`

/**
 * Reader / library action: the PGN of the games recognised in a book (with the
 * book's prose as {comments}), as one file, as one file per game (zip), or put
 * for review in Database → Generated PGN. Self-contained: mount it anywhere.
 */
export default function BookPgnButton({ bookId, bookTitle, author, chapter, chapters, titleSeparator, algorithm, variant = 'icon', defaultScope = variant === 'link' ? 'book' : 'chapter', client = generatedPgnApi, loadChapter, save = saveFile }: BookPgnButtonProps) {
  const [open, setOpen] = useState(false)
  const [scope, setScope] = useState<Scope>(defaultScope)
  const [busy, setBusy] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const abort = useRef<AbortController | null>(null)
  const title = bookTitle ?? `Book ${bookId}`

  const run = async (action: Action) => {
    setError(null)
    setMessage(null)
    const ctrl = new AbortController()
    abort.current = ctrl
    try {
      const load = loadChapter ?? serverChapterLoader(bookId, { bookTitle, titleSeparator })
      setBusy('Reading the games…')
      const orders = scope === 'chapter' ? [chapter] : chapters && chapters.length > 0 ? chapters : await bookChapterOrders(load)
      const { games, failedChapters } = await generateBookGames({ title, author }, orders, load, {
        algorithm, signal: ctrl.signal, onProgress: (done, total) => setBusy(`Reading the games… chapter ${done} of ${total}`),
      })
      if (games.length === 0) {
        setError(`No games were recognised in ${scope === 'chapter' ? 'this chapter' : 'this book'}.`)
        return
      }
      const skipped = failedChapters.length > 0 ? ` (${plural(failedChapters.length, 'chapter')} could not be read: ${failedChapters.join(', ')})` : ''
      if (action === 'file') {
        save(`${safeName(title)}${scope === 'chapter' ? `-ch${chapter}` : ''}.pgn`, joinPgns(games), 'application/x-chess-pgn')
        setMessage(`Downloaded ${plural(games.length, 'game')} in one PGN file${skipped}.`)
      } else if (action === 'zip') {
        save(`${safeName(title)}${scope === 'chapter' ? `-ch${chapter}` : ''}-games.zip`, zipStored(games.map((g: GeneratedGame) => ({ name: gameFileName(g), text: g.pgn }))), 'application/zip')
        setMessage(`Downloaded ${plural(games.length, 'PGN file')} in a zip${skipped}.`)
      } else {
        setBusy('Saving for review…')
        const r = await client.create(games.map((g) => ({ bookId, bookTitle: title, chapter: g.chapter, gameIndex: g.gameIndex, white: g.white, black: g.black, event: g.event, result: g.result, pgn: g.pgn })))
        setMessage(`Put ${plural(r.created + r.updated, 'game')} for review${r.skipped > 0 ? ` (${plural(r.skipped, 'game')} already reviewed, kept as they were)` : ''}${skipped}. Open Database → Generated PGN.`)
      }
    } catch (e) {
      if (!(e instanceof DOMException && e.name === 'AbortError')) setError(e instanceof Error ? e.message : String(e))
    } finally {
      abort.current = null
      setBusy(null)
    }
  }

  return (
    <>
      <button type="button" aria-label="Generate PGN from the games of this book" title="Generate PGN from the games of this book" onClick={() => setOpen(true)}
        className={variant === 'link' ? 'text-blue-600 hover:underline' : 'flex h-9 items-center justify-center rounded-lg border border-slate-200 bg-white px-2 text-xs font-semibold text-slate-600 shadow-sm hover:bg-slate-50 hover:text-slate-900'}>
        {variant === 'link' ? 'Generate PGN…' : 'PGN'}
      </button>
      {open && (
        <div role="dialog" aria-modal="true" aria-label="Generate PGN" className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-lg bg-white p-4 text-sm shadow-xl">
            <h2 className="text-base font-semibold text-slate-800">PGN of the games of “{title}”</h2>
            <p className="mt-1 text-xs text-slate-500">The recognised games, with the book’s text between the moves as comments.</p>
            <fieldset className="mt-3 flex gap-4" disabled={busy !== null}>
              <legend className="sr-only">Scope</legend>
              <label className="flex items-center gap-1"><input type="radio" name="pgn-scope" checked={scope === 'chapter'} onChange={() => setScope('chapter')} /> This chapter</label>
              <label className="flex items-center gap-1"><input type="radio" name="pgn-scope" checked={scope === 'book'} onChange={() => setScope('book')} /> Whole book</label>
            </fieldset>
            <div className="mt-3 flex flex-col gap-2">
              <button type="button" disabled={busy !== null} onClick={() => void run('file')} className="rounded border border-slate-300 px-2 py-1 text-left hover:bg-slate-50 disabled:opacity-50">Download one PGN file</button>
              <button type="button" disabled={busy !== null} onClick={() => void run('zip')} className="rounded border border-slate-300 px-2 py-1 text-left hover:bg-slate-50 disabled:opacity-50">Download one PGN per game (zip)</button>
              <button type="button" disabled={busy !== null} onClick={() => void run('review')} className="rounded border border-slate-300 px-2 py-1 text-left hover:bg-slate-50 disabled:opacity-50">Put for review (Database → Generated PGN)</button>
            </div>
            {busy && (
              <p role="status" className="mt-2 flex items-center gap-2 text-xs text-slate-600">
                {busy}
                <button type="button" className="underline" onClick={() => abort.current?.abort()}>Cancel</button>
              </p>
            )}
            {message && <p role="status" className="mt-2 text-xs text-emerald-700">{message}</p>}
            {error && <p role="alert" className="mt-2 text-xs text-red-600">{error}</p>}
            <div className="mt-3 text-right"><button type="button" className="rounded border border-slate-300 px-3 py-1" onClick={() => setOpen(false)}>Close</button></div>
          </div>
        </div>
      )}
    </>
  )
}
