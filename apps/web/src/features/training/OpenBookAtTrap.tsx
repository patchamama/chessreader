import { useInRouterContext, useNavigate } from 'react-router-dom'
import { openGameInBook } from '../database/openInBook'
import { withBusy } from '../../shared/layout/busyStore'

interface Props { book: { id: string; title: string }; chapter: number; label?: string }

/** Opens the book (library copy on the server, or the resources text) at the chapter of a trap. */
export function OpenBookAtTrap(props: Props) {
  return useInRouterContext() ? <OpenButton {...props} /> : null
}

function OpenButton({ book, chapter, label = 'Open the book at this trap' }: Props) {
  const navigate = useNavigate()
  const open = () => withBusy('Opening the book', async () => {
    navigate(await openGameInBook({ ...book, author: null, lang: 'es' }, { chapter, gameIndex: null }))
  })
  return (
    <button type="button" className="rounded border border-slate-300 px-2 py-0.5 text-xs hover:bg-slate-50" aria-label={label} title={label} onClick={() => void open()}>
      📕 {book.title}
    </button>
  )
}
