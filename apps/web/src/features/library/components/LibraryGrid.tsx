import { useState, type MouseEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { useBooks } from '../api/libraryApi'
import BookCard from './BookCard'
import UploadBookForm from './UploadBookForm'
import { isDemoHost } from '../../../shared/env/devMode'
import { useSettingsStore } from '../../../shared/settings/settingsStore'
import { EXTERNAL_BOOK_ID } from '../../../shared/externalBook/externalBookStore'
import { resourcesConfigured } from '../commentdb/commentLookup'
import { loadBooks, type DbBook } from '../../database/resources'
import { openRepoBook } from '../../errors/repoBooks'
import { withBusy } from '../../../shared/layout/busyStore'
import { markVisited, useVisitedCheck } from '../../../shared/visited/visitedStore'
import { VisitedMark } from '../../../shared/visited/VisitedMark'
import { hasServerSession } from '../../../shared/api/serverSession'
import { downloadEpub } from '../../suggestions/epubApi'
import BookCoverDialog from './BookCoverDialog'
import BookStatsPanel from '../stats/BookStatsPanel'
import { canWriteResources } from '../../suggestions/suggestionsApi'

const visitedCard = 'rounded-lg ring-2 ring-violet-300'

export default function LibraryGrid() {
  const demo = isDemoHost()
  const { isLoading, data: books } = useBooks()
  const hidden = useSettingsStore((s) => s.hiddenExamples)
  const set = useSettingsStore((s) => s.set)
  // In the demo every book is an example: shown unless the reader closed it.
  const shown = demo ? books?.filter((b) => !hidden.includes(b.id)) : books
  const visited = useVisitedCheck()
  // Server books only: download the EPUB, suggest a cover (S6).
  const server = !demo && hasServerSession()
  const [coverOf, setCoverOf] = useState<{ id: number; title: string } | null>(null)
  const [downloadError, setDownloadError] = useState<string | null>(null)
  const download = (book: { id: number; title: string }) => {
    setDownloadError(null)
    withBusy(`Downloading ${book.title}…`, () => downloadEpub(book.id, book.title)).catch((e: Error) => setDownloadError(`${book.title}: ${e.message}`))
  }

  return (
    <div>
      <UploadBookForm />
      {downloadError && <p role="alert" className="px-4 text-sm text-red-600">Could not download {downloadError}</p>}
      {coverOf && <BookCoverDialog book={coverOf} onClose={() => setCoverOf(null)} />}
      {isLoading && (
        <div role="status" className="flex justify-center p-8">
          <span className="sr-only">Loading…</span>
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-500 border-t-transparent" />
        </div>
      )}
      {!isLoading && (!shown || shown.length === 0) && (
        <div className="p-8 text-center text-gray-500">
          No books yet
        </div>
      )}
      {!isLoading && shown && shown.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 p-4">
          {shown.map((book) => {
            const seen = visited('serverBook', book.id)
            // A click on a link to the reader inside the card records the book as opened (S9).
            const record = (e: MouseEvent) => {
              if ((e.target as HTMLElement).closest?.(`a[href$="/read/${book.id}"]`)) markVisited('serverBook', book.id)
            }
            return (
              <div key={book.id} data-book-card="" {...(seen ? { 'data-visited': '' } : {})} className={`relative ${seen ? visitedCard : ''}`} onClickCapture={record}>
                {seen && <span className="pointer-events-none absolute left-2 top-2 z-10"><VisitedMark /></span>}
                <BookCard book={book} onHide={demo ? () => set({ hiddenExamples: [...hidden, book.id] }) : undefined} />
                {server && (
                  <div className="mt-1 flex gap-3 px-1 text-xs">
                    <button type="button" className="text-blue-600 hover:underline" aria-label={`Download EPUB of ${book.title}`} onClick={() => download(book)}>Download EPUB</button>
                    <button type="button" className="text-blue-600 hover:underline" aria-label={`Cover of ${book.title}…`} onClick={() => setCoverOf({ id: book.id, title: book.title })}>Cover…</button>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
      {demo && resourcesConfigured() && <RepoBooks />}
    </div>
  )
}

/** The books of the private resources repository (GitHub token in Settings), opened from their text. */
function RepoBooks() {
  const navigate = useNavigate()
  const { data, error } = useQuery<DbBook[]>({ queryKey: ['resources', 'books'], queryFn: loadBooks })
  const [opening, setOpening] = useState<string | null>(null)
  const [failed, setFailed] = useState<string | null>(null)
  const visited = useVisitedCheck()
  const read = (b: DbBook) => {
    markVisited('repoBook', b.id)
    setOpening(b.id)
    setFailed(null)
    withBusy(`Opening ${b.title}…`, () => openRepoBook(b)).then(() => navigate(`/read/${EXTERNAL_BOOK_ID}`), (e: Error) => setFailed(`${b.title}: ${e.message}`)).finally(() => setOpening(null))
  }
  return (
    <section className="p-4" aria-label="Books of the resources repository">
      <h2 className="text-lg font-semibold text-slate-800">Books of your resources</h2>
      {error && <p role="alert" className="text-sm text-red-600">Could not read the resources: {(error as Error).message}</p>}
      {failed && <p role="alert" className="text-sm text-red-600">{failed}</p>}
      <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
        {(data ?? []).map((b) => (
          <div key={b.id} data-book-card="" {...(visited('repoBook', b.id) ? { 'data-visited': '' } : {})} className={`relative border rounded-lg p-4 flex flex-col gap-2 shadow-sm ${visited('repoBook', b.id) ? 'border-violet-300 bg-violet-50' : 'bg-white'}`}>
            {visited('repoBook', b.id) && <span className="absolute right-2 top-2"><VisitedMark /></span>}
            {b.thumb && <img src={b.thumb} alt={`Cover of ${b.title}`} className="mb-1 h-44 w-full rounded-md object-contain bg-slate-100" />}
            <h3 className="font-semibold leading-snug">{b.title}</h3>
            {b.author && <p className="text-sm text-gray-600">{b.author}</p>}
            <p className="text-xs text-slate-500">{b.games} games{b.period ? ` · ${b.period[0]}–${b.period[1]}` : ''}</p>
            {canWriteResources() && <BookStatsPanel bookId={b.id} title={b.title} />}
            <button className="mt-auto self-start text-sm font-medium text-blue-600 hover:underline disabled:opacity-50" disabled={opening === b.id} aria-label={`Read ${b.title}`} onClick={() => read(b)}>
              {opening === b.id ? 'Opening…' : 'Read'}
            </button>
          </div>
        ))}
      </div>
    </section>
  )
}
