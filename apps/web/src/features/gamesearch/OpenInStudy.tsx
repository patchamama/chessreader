import { useState } from 'react'
import { useInRouterContext, useNavigate } from 'react-router-dom'
import { pgnToChapters } from './pgnChapters'
import { EXTERNAL_BOOK_ID, useExternalBookStore } from '../../shared/externalBook/externalBookStore'
import { saveProgress } from '../library/store/readingStore'

interface Props {
  title: string
  /** The game's PGN (e.g. read from Lichess when clicked). */
  load: () => Promise<string>
  className?: string
}

/**
 * Opens a game in the study (the reader with its board, comments, review and
 * narration) as the browser's own book — next to the "on Lichess" links.
 */
export function OpenInStudy(props: Props) {
  // Outside a router (some isolated views) there is no study to go to.
  return useInRouterContext() ? <OpenInStudyButton {...props} /> : null
}

function OpenInStudyButton({ title, load, className }: Props) {
  const navigate = useNavigate()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const open = async () => {
    setBusy(true)
    setError(null)
    try {
      const { chapters } = pgnToChapters(await load())
      if (chapters.length === 0) throw new Error('no game could be read from it')
      useExternalBookStore.getState().open(title, chapters)
      saveProgress(EXTERNAL_BOOK_ID, 1)
      navigate(`/read/${EXTERNAL_BOOK_ID}`)
    } catch (e) {
      setError(`Could not open the game: ${(e as Error).message}`)
    } finally {
      setBusy(false)
    }
  }
  return (
    <span className="inline-flex items-center gap-2">
      <button
        className={className ?? 'rounded border border-slate-300 px-2 py-0.5 text-xs hover:bg-slate-50 disabled:opacity-50'}
        disabled={busy}
        aria-label={`Open ${title} in the study`}
        onClick={() => void open()}
      >
        {busy ? 'Opening…' : 'Open in the study'}
      </button>
      {error && <span role="alert" className="text-xs text-red-600">{error}</span>}
    </span>
  )
}
