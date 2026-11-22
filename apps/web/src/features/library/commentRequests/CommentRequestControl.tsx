import { useState } from 'react'
import { cancelBookCommentRequest, requestBookComments, type CommentRequestState, type RequestableBook } from './commentRequestApi'

const chip = 'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs'
const button = 'rounded border border-slate-300 px-1.5 py-0.5 text-xs text-slate-600 hover:bg-slate-50 disabled:opacity-40'

/**
 * Ask for the comments of a book to be added to the commentary database, and
 * show how the request stands: none → button; pending → chip with a cancel
 * link; done / rejected → chip. `onChanged` lets the list refresh.
 */
export default function CommentRequestControl({ book, state, onChanged }: { book: RequestableBook; state: CommentRequestState; onChanged?: () => void }) {
  // What this session did, until the refreshed list says the same.
  const [local, setLocal] = useState<CommentRequestState | 'cancelled'>(undefined)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [download, setDownload] = useState<{ path: string; json: string } | null>(null)
  const current = local === 'cancelled' ? null : local ?? state

  const request = async () => {
    if (busy) return
    setBusy(true)
    setError(null)
    try {
      const r = await requestBookComments(book, '')
      if (r.saved) {
        setLocal('pending')
        onChanged?.()
      } else {
        setDownload({ path: r.path, json: r.json })
        if (r.reason) setError(`Could not send the request: ${r.reason}`)
      }
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const cancel = async () => {
    if (busy || typeof book.id !== 'number') return
    setBusy(true)
    setError(null)
    try {
      await cancelBookCommentRequest(book.id)
      setLocal('cancelled')
      onChanged?.()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <span className="inline-flex flex-wrap items-center gap-1.5">
      {current === 'pending' && (
        <>
          <span className={`${chip} bg-amber-50 text-amber-800`}>Requested ✓</span>
          {typeof book.id === 'number' && <button type="button" className="text-xs text-slate-500 underline" disabled={busy} onClick={() => void cancel()}>Cancel request</button>}
        </>
      )}
      {current === 'done' && <span className={`${chip} bg-green-50 text-green-800`}>Comments added</span>}
      {current === 'rejected' && <span className={`${chip} bg-slate-100 text-slate-600`}>Request declined</span>}
      {!current && !download && (
        <button
          type="button"
          className={button}
          disabled={busy}
          aria-label="Request adding the comments of this book to the commentary database"
          title="Ask for the comments of this book to be added to the commentary database (an admin reviews the request)."
          onClick={() => void request()}
        >
          Request its comments
        </button>
      )}
      {download && (
        <a
          className="text-xs text-blue-700 underline"
          href={`data:application/json;charset=utf-8,${encodeURIComponent(download.json)}`}
          download={download.path.split('/').pop()}
          title={`No server nor write token: download the request and add it to the resources repository at ${download.path}`}
        >
          Download the request
        </a>
      )}
      {error && <span role="alert" className="text-xs text-red-700">{error}</span>}
    </span>
  )
}
