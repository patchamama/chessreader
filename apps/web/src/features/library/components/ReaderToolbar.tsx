import { useReaderViewStore } from '../store/readerViewStore'

const base = 'flex h-9 w-9 items-center justify-center rounded-lg border shadow-sm transition'
const on = 'border-amber-400 bg-amber-50 text-amber-700'
const off = 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50 hover:text-slate-900'

/**
 * Show or hide every book comment inserted in the text (S4). Shown by default
 * and remembered; each time they are shown again, a position with several
 * remarks in the database shows one of them at random.
 */
export function BookCommentsToggle() {
  const shown = useReaderViewStore((s) => s.bookComments)
  const toggle = useReaderViewStore((s) => s.toggleBookComments)
  const label = shown ? 'Hide book comments' : 'Show book comments'
  return (
    <button type="button" onClick={toggle} title={label} aria-label={label} aria-pressed={shown} className={`${base} ${shown ? on : off}`}>
      <svg aria-hidden="true" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M8 10h8M8 14h5M21 12c0 4.4-4 8-9 8a9.9 9.9 0 01-4.3-.9L3 20l1.3-3.9A7.6 7.6 0 013 12c0-4.4 4-8 9-8s9 3.6 9 8z" />
        {!shown && <path strokeLinecap="round" d="M4 4l16 16" />}
      </svg>
    </button>
  )
}
